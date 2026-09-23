import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import {
  parseMarkdownFrontmatter,
  parseZipImport,
  toSkillDto,
  toSkillVersionDto,
  type SkillImportDraft,
} from './helpers.js';

/**
 * Skills module — service. Business logic for the Skills Lab CRUD + version
 * history + parse-only import preview. A Skill = name/description/type/body +
 * enabled + version; config changes are versioned via `skill_versions`
 * (repository).
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[];
  change_summary?: string;
}

export type SkillImportInput =
  | { kind: 'markdown'; content: string }
  | { kind: 'zip'; content_base64: string };

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
      ...(patch.change_summary !== undefined ? { changeSummary: patch.change_summary } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Version history for a skill, newest first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (the route maps that to
   * 404) so body snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /** Token count of a skill's body via the shared tokenizer adapter. */
  async tokenCount(workspaceId: string, id: string): Promise<number | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    return this.container.tokenizer.count(row.body);
  }

  /**
   * Parse-only import preview: extract `{ name, description, body }` from a
   * raw markdown file or a base64-encoded zip archive. Does NOT insert
   * anything — the client shows this as a trust-warning preview and only
   * calls `create` (with `source: 'extracted'`) after the user confirms.
   */
  importDraft(input: SkillImportInput): SkillImportDraft {
    return input.kind === 'markdown'
      ? parseMarkdownFrontmatter(input.content)
      : parseZipImport(input.content_base64);
  }
}
