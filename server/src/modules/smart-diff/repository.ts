import { and, eq, desc, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow, FindingRow } from '../../db/rows.js';
import { selectLatestReviewPerAgent } from './helpers.js';

export type { PullRow, FindingRow };

/**
 * Smart Diff data-access layer. The ONLY file in this module that imports
 * `drizzle-orm`/`../../db/schema.js` — mirrors `pulls/repository.ts` and
 * `reviews/repository/review.repo.ts`.
 */
export class SmartDiffRepository {
  constructor(private db: Db) {}

  async getPullForWorkspace(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr;
  }

  async getPrFiles(prId: string): Promise<{ path: string; additions: number; deletions: number }[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * Findings from the latest `kind='review'` review per agent for this PR
   * (A2: `agentId === null` is its own bucket).
   */
  async latestReviewFindingsPerAgent(prId: string): Promise<FindingRow[]> {
    const reviews = await this.db
      .select({ id: t.reviews.id, agentId: t.reviews.agentId, createdAt: t.reviews.createdAt })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));

    const latest = selectLatestReviewPerAgent(reviews);
    if (latest.length === 0) return [];

    const ids = latest.map((r) => r.id);
    return this.db.select().from(t.findings).where(inArray(t.findings.reviewId, ids));
  }
}
