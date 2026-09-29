import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Blast data-access layer. The ONLY file in this module that imports
 * `drizzle-orm`/`../../db/schema.js` — mirrors `smart-diff/repository.ts`.
 * No repo-intel table is queried here; the repo-intel read model is reached
 * exclusively through `container.repoIntel` (the facade).
 */
export class BlastRepository {
  constructor(private db: Db) {}

  /**
   * `defaultBranch` is joined in from `repos` here (not a repo-intel table —
   * `repos` is the core repo record, so this stays inside the blast module's
   * own data-access layer). It's the branch the indexer clones/syncs before
   * every (re)index (`repo-intel/service.ts`'s `resyncRepo`:
   * `git.sync(ref, repo.defaultBranch)`), i.e. "which branch is this index
   * built from" for the not-indexed-yet hint (R4/R5 follow-up).
   */
  async getPullForWorkspace(
    workspaceId: string,
    prId: string,
  ): Promise<
    { id: string; repoId: string; headSha: string; defaultBranch: string | null } | undefined
  > {
    const [pr] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr;
  }

  async getPrFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
