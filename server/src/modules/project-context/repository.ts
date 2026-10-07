/**
 * project-context repository — the ONLY file in this module that touches
 * drizzle-orm / the schema. Never writes to agents/skills/*_versions (AC-27).
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface RepoRecord {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
  defaultBranch: string;
}

export class ProjectContextRepository {
  constructor(private readonly db: Db) {}

  async getRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRecord | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return row ?? null;
  }

  async getAgentInWorkspace(workspaceId: string, agentId: string): Promise<{ id: string; name: string } | null> {
    const [row] = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
      .limit(1);
    return row ?? null;
  }

  async getSkillInWorkspace(workspaceId: string, skillId: string): Promise<{ id: string; name: string } | null> {
    const [row] = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)))
      .limit(1);
    return row ?? null;
  }

  async listAgentPaths(agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  async listSkillPaths(skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  async replaceAgentPaths(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(paths.map((path, position) => ({ agentId, repoId, path, position })));
    });
  }

  async replaceSkillPaths(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, position) => ({ skillId, repoId, path, position })));
    });
  }

  /** Enabled skills bound to the agent, in `agent_skills.order`. */
  async listEnabledSkillLinks(
    agentId: string,
  ): Promise<{ skillId: string; skillName: string; order: number }[]> {
    return this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        order: t.agentSkills.order,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
  }

  /** path → distinct agent ids using it (directly, or via an enabled bound skill). */
  async usedByForRepo(workspaceId: string, repoId: string): Promise<Map<string, Set<string>>> {
    const direct = await this.db
      .select({ path: t.agentContextDocs.path, agentId: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(and(eq(t.agentContextDocs.repoId, repoId), eq(t.agents.workspaceId, workspaceId)));
    const viaSkill = await this.db
      .select({ path: t.skillContextDocs.path, agentId: t.agentSkills.agentId })
      .from(t.skillContextDocs)
      .innerJoin(
        t.skills,
        and(eq(t.skills.id, t.skillContextDocs.skillId), eq(t.skills.enabled, true)),
      )
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.skillContextDocs.repoId, repoId), eq(t.agents.workspaceId, workspaceId)));
    const out = new Map<string, Set<string>>();
    for (const r of [...direct, ...viaSkill]) {
      let set = out.get(r.path);
      if (!set) out.set(r.path, (set = new Set()));
      set.add(r.agentId);
    }
    return out;
  }
}
