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

  async getPullForWorkspace(
    workspaceId: string,
    prId: string,
  ): Promise<{ id: string; repoId: string; headSha: string } | undefined> {
    const [pr] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
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
