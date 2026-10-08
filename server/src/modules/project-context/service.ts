/**
 * project-context service — discovery of repo Markdown docs, attachments to
 * agents/skills, and token accounting. No fastify / drizzle imports.
 */
import {
  renderProjectContextDoc,
  renderProjectContextHeader,
} from '@devdigest/reviewer-core';
import {
  NOT_CLONED_CODE,
  type AgentContext,
  type ContextAttachedRow,
  type ContextDoc,
  type ContextDocContent,
  type ContextDocList,
  type ContextDocType,
  type SkillContext,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoDocPathError } from '../../adapters/repo-docs/port.js';
import { guardRepoDocs, REPO_DOCS_UNAVAILABLE_MESSAGE } from '../_shared/repo-docs-errors.js';
import { ProjectContextRepository, type RepoRecord } from './repository.js';
import { docName, docTypeFor, isDiscoverable } from '../_shared/project-docs.js';
import { docDir, resolveEffectiveOrder, rootLabels } from './helpers.js';
import { cacheKey, getOrCount } from './token-cache.js';

type ErrorLog = { error: (obj: object, msg: string) => void };

interface Discovered {
  path: string;
  type: ContextDocType;
  tokens: number;
}

export type ResolvedProjectContext =
  | { status: 'not_cloned' }
  | {
      status: 'resolved';
      docs: { path: string; text: string; tokens: number }[];
      skipped: { path: string; reason: 'missing' | 'unreadable' }[];
      headerTokens: number;
      totalTokens: number;
    };

export interface ResolveForRunInput {
  workspaceId: string;
  agentId: string;
  repo: { id: string; owner: string; name: string; clonePath: string | null };
  enabledSkills: { id: string; name: string }[];
}

export class ProjectContextService {
  private readonly repo: ProjectContextRepository;

  constructor(private readonly container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  private get dirs(): readonly string[] {
    return this.container.config.projectContextDirs;
  }

  private async requireClonedRepo(workspaceId: string, repoId: string): Promise<RepoRecord> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    if (!repo.clonePath) {
      throw new ConflictError(NOT_CLONED_CODE, 'Repository has not been cloned yet');
    }
    return repo;
  }

  private async discover(repo: RepoRecord): Promise<Map<string, Discovered>> {
    const { repoDocs, tokenizer } = this.container;
    const files = (await repoDocs.listMarkdown(repo)).filter((f) => isDiscoverable(f.path, this.dirs));
    const found = await Promise.all(
      files.map(async (f): Promise<Discovered | null> => {
        const tokens = await getOrCount(cacheKey(repo.id, f.path), f.mtimeMs, f.size, async () => {
          const r = await repoDocs.read(repo, f.path);
          return r.ok ? tokenizer.count(renderProjectContextDoc({ path: f.path, text: r.text })) : null;
        });
        const type = docTypeFor(f.path, this.dirs);
        if (tokens === null || type === null) return null;
        return { path: f.path, type, tokens };
      }),
    );
    const out = new Map<string, Discovered>();
    for (const d of found) if (d) out.set(d.path, d);
    return out;
  }

  async listDocs(workspaceId: string, repoId: string, log?: ErrorLog): Promise<ContextDocList> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    const [found, usedBy, modified] = await Promise.all([
      guardRepoDocs(() => this.discover(repo), log),
      this.repo.usedByForRepo(workspaceId, repoId),
      guardRepoDocs(() => this.container.repoDocs.modifiedPaths(repo), log),
    ]);
    const modifiedSet = new Set(modified.filter((p) => isDiscoverable(p, this.dirs)));
    const docs: ContextDoc[] = [...found.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((d) => ({
        path: d.path,
        name: docName(d.path),
        dir: docDir(d.path),
        type: d.type,
        tokens: d.tokens,
        used_by: usedBy.get(d.path)?.size ?? 0,
        locally_modified: modifiedSet.has(d.path),
      }));
    return {
      roots: rootLabels(this.dirs),
      total_tokens: docs.reduce((n, d) => n + d.tokens, 0),
      docs,
    };
  }

  async getDoc(
    workspaceId: string,
    repoId: string,
    path: string,
    log?: ErrorLog,
  ): Promise<ContextDocContent> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    const found = await guardRepoDocs(() => this.discover(repo), log);
    const d = found.get(path);
    if (!d) throw new NotFoundError('Document not found');
    const [read, usedBy, modified] = await Promise.all([
      guardRepoDocs(() => this.container.repoDocs.read(repo, path), log),
      this.repo.usedByForRepo(workspaceId, repoId),
      guardRepoDocs(() => this.container.repoDocs.modifiedPaths(repo), log),
    ]);
    if (!read.ok) throw new NotFoundError('Document not found');
    return {
      path,
      name: docName(path),
      dir: docDir(path),
      type: d.type,
      tokens: d.tokens,
      used_by: usedBy.get(path)?.size ?? 0,
      locally_modified: modified.includes(path),
      content: read.text,
    };
  }

  /**
   * Overwrite an existing discovered doc in the clone. The only write path for
   * project-context docs: no git, LLM or GitHub call, and the content is never logged.
   */
  async saveDoc(
    workspaceId: string,
    repoId: string,
    path: string,
    content: string,
    log?: ErrorLog & { info: (obj: object, msg: string) => void },
  ): Promise<ContextDocContent> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    if (
      !isDiscoverable(path, this.dirs) ||
      !(await guardRepoDocs(() => this.discover(repo), log)).has(path)
    ) {
      throw new ValidationError('Path is not a project-context document', { paths: [path] });
    }
    let written: { bytes: number };
    try {
      written = await this.container.repoDocs.write(repo, path, content);
    } catch (err) {
      if (err instanceof RepoDocPathError) throw new ValidationError(err.message, { paths: [path] });
      log?.error({ err }, 'repo docs access failed');
      throw new ExternalServiceError(REPO_DOCS_UNAVAILABLE_MESSAGE);
    }
    log?.info({ repoId, path, bytes: written.bytes }, 'project context doc saved');
    return this.getDoc(workspaceId, repoId, path, log);
  }

  private rowFor(path: string, found: Map<string, Discovered>): ContextAttachedRow {
    const d = found.get(path);
    return d
      ? { path, type: d.type, tokens: d.tokens, status: 'present' }
      : { path, type: docTypeFor(path, this.dirs), tokens: null, status: 'missing' };
  }

  private async validateNewPaths(
    repo: RepoRecord,
    saved: string[],
    next: string[],
  ): Promise<void> {
    const savedSet = new Set(saved);
    const added = next.filter((p) => !savedSet.has(p));
    if (added.length === 0) return;
    const found = await this.discover(repo);
    const bad = added.filter((p) => !found.has(p));
    if (bad.length > 0) {
      throw new ValidationError('Some paths are not project-context documents', { paths: bad });
    }
  }

  private async totalTokens(rows: { path: string }[], found: Map<string, Discovered>) {
    const headerTokens = this.container.tokenizer.count(renderProjectContextHeader());
    let sum = 0;
    let any = false;
    for (const r of rows) {
      const d = found.get(r.path);
      if (d) {
        any = true;
        sum += d.tokens;
      }
    }
    return { headerTokens, total: any ? headerTokens + sum : 0 };
  }

  async getAgentContext(workspaceId: string, agentId: string, repoId: string): Promise<AgentContext> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    const agent = await this.repo.getAgentInWorkspace(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [own, links, found] = await Promise.all([
      this.repo.listAgentPaths(agentId, repoId),
      this.repo.listEnabledSkillLinks(agentId),
      this.discover(repo),
    ]);
    const skills = await Promise.all(
      links.map(async (l) => ({
        id: l.skillId,
        name: l.skillName,
        paths: await this.repo.listSkillPaths(l.skillId, repoId),
      })),
    );
    const effective = resolveEffectiveOrder(own, skills);
    const inherited = effective.flatMap((e) =>
      e.source.kind === 'skill'
        ? [{ ...this.rowFor(e.path, found), skill_id: e.source.id, skill_name: e.source.name }]
        : [],
    );
    const { headerTokens, total } = await this.totalTokens(effective, found);
    return {
      repo_id: repoId,
      attached: own.map((p) => this.rowFor(p, found)),
      inherited,
      header_tokens: headerTokens,
      total_tokens: total,
    };
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<AgentContext> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    const agent = await this.repo.getAgentInWorkspace(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    await this.validateNewPaths(repo, await this.repo.listAgentPaths(agentId, repoId), paths);
    await this.repo.replaceAgentPaths(agentId, repoId, paths);
    return this.getAgentContext(workspaceId, agentId, repoId);
  }

  async getSkillContext(workspaceId: string, skillId: string, repoId: string): Promise<SkillContext> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    const skill = await this.repo.getSkillInWorkspace(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const [own, found] = await Promise.all([
      this.repo.listSkillPaths(skillId, repoId),
      this.discover(repo),
    ]);
    const { headerTokens, total } = await this.totalTokens(own.map((path) => ({ path })), found);
    return {
      repo_id: repoId,
      attached: own.map((p) => this.rowFor(p, found)),
      header_tokens: headerTokens,
      total_tokens: total,
    };
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<SkillContext> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    const skill = await this.repo.getSkillInWorkspace(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    await this.validateNewPaths(repo, await this.repo.listSkillPaths(skillId, repoId), paths);
    await this.repo.replaceSkillPaths(skillId, repoId, paths);
    return this.getSkillContext(workspaceId, skillId, repoId);
  }
  /**
   * Run-time resolution: the agent's own docs then enabled skills' docs (deduped by
   * `resolveEffectiveOrder`), read fresh from the clone. Missing/unreadable docs are
   * skipped, never thrown. `workspaceId` scopes nothing here because the caller has
   * already resolved the repo/agent inside the workspace.
   */
  async resolveForRun(input: ResolveForRunInput): Promise<ResolvedProjectContext> {
    const { agentId, repo, enabledSkills } = input;
    const { repoDocs, tokenizer } = this.container;
    const [own, skills] = await Promise.all([
      this.repo.listAgentPaths(agentId, repo.id),
      Promise.all(
        enabledSkills.map(async (s) => ({
          id: s.id,
          name: s.name,
          paths: await this.repo.listSkillPaths(s.id, repo.id),
        })),
      ),
    ]);
    const effective = resolveEffectiveOrder(own, skills);
    const headerTokens = tokenizer.count(renderProjectContextHeader());
    if (effective.length === 0) {
      return { status: 'resolved', docs: [], skipped: [], headerTokens, totalTokens: 0 };
    }
    if (!repo.clonePath) return { status: 'not_cloned' };

    const docs: { path: string; text: string; tokens: number }[] = [];
    const skipped: { path: string; reason: 'missing' | 'unreadable' }[] = [];
    for (const { path } of effective) {
      if (!isDiscoverable(path, this.dirs)) {
        skipped.push({ path, reason: 'missing' });
        continue;
      }
      let r;
      try {
        r = await repoDocs.read(repo, path);
      } catch (err) {
        // A saved path that fails confinement (e.g. `../README.md`) is unreadable, not fatal.
        if (!(err instanceof RepoDocPathError)) throw err;
        skipped.push({ path, reason: 'unreadable' });
        continue;
      }
      if (!r.ok) {
        skipped.push({ path, reason: r.reason === 'missing' ? 'missing' : 'unreadable' });
        continue;
      }
      docs.push({
        path,
        text: r.text,
        tokens: tokenizer.count(renderProjectContextDoc({ path, text: r.text })),
      });
    }
    const totalTokens = docs.length ? headerTokens + docs.reduce((n, d) => n + d.tokens, 0) : 0;
    return { status: 'resolved', docs, skipped, headerTokens, totalTokens };
  }

  /**
   * Repo-wide union of attached docs (any agent, or any enabled bound skill) —
   * used by the PR brief, which has no single agent. Deduped by path (map
   * keys), sorted; reads like `resolveForRun` but never counts tokens.
   */
  async resolveForRepo(
    workspaceId: string,
    repo: { id: string; owner: string; name: string; clonePath: string | null },
  ): Promise<
    | { status: 'none' }
    | { status: 'not_cloned' }
    | {
        status: 'resolved';
        docs: { path: string; text: string }[];
        skipped: { path: string; reason: 'missing' | 'unreadable' }[];
      }
  > {
    const paths = [...(await this.repo.usedByForRepo(workspaceId, repo.id)).keys()].sort();
    if (paths.length === 0) return { status: 'none' };
    if (!repo.clonePath) return { status: 'not_cloned' };

    const docs: { path: string; text: string }[] = [];
    const skipped: { path: string; reason: 'missing' | 'unreadable' }[] = [];
    for (const path of paths) {
      if (!isDiscoverable(path, this.dirs)) {
        skipped.push({ path, reason: 'missing' });
        continue;
      }
      let r;
      try {
        r = await this.container.repoDocs.read(repo, path);
      } catch (err) {
        if (!(err instanceof RepoDocPathError)) throw err;
        skipped.push({ path, reason: 'unreadable' });
        continue;
      }
      if (!r.ok) {
        skipped.push({ path, reason: r.reason === 'missing' ? 'missing' : 'unreadable' });
        continue;
      }
      docs.push({ path, text: r.text });
    }
    return { status: 'resolved', docs, skipped };
  }
}
