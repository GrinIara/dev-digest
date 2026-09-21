import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow, FindingRow } from '../../db/rows.js';
import type { PrMeta as GitHubPrListItem, PrDetail } from '@devdigest/shared';

export type { PullRow, FindingRow };
export type RepoRow = typeof t.repos.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;
export type ReviewRow = typeof t.reviews.$inferSelect;

/**
 * F1 — pulls data-access layer. The ONLY place that touches `pull_requests`,
 * `pr_files`, `pr_commits` (plus the read-only queries into `reviews`,
 * `findings`, `agent_runs` needed for the PR-list rollups). Every query that
 * can be scoped by workspace is; unscoped lookups (by `repoId`/`prId` alone)
 * are only reachable after an earlier workspace-scoped lookup in the same
 * call chain (mirrors the convention in `reviews/repository.ts`).
 */
export class PullsRepository {
  constructor(private db: Db) {}

  // ---- repos ---------------------------------------------------------------

  async getRepoForWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo;
  }

  async getRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return repo;
  }

  async touchRepoPolledAt(repoId: string): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repoId));
  }

  // ---- pull_requests ---------------------------------------------------------

  /**
   * Idempotent upsert of one GitHub PR-list item (unique on repo_id+number).
   * Shared by the pulls list sync and the manual poll — the two previously had
   * their own copy-pasted version of this block.
   */
  async upsertFromGitHub(workspaceId: string, repoId: string, pr: GitHubPrListItem): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        },
      });
  }

  async listForRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  async getForWorkspace(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr;
  }

  /** Backfill diff-stat columns (not present on GitHub's PR-list payload). */
  async updateDiffStats(
    prId: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, prId));
  }

  /** Persist a refreshed PR detail's body + diff stats. */
  async updateDetail(
    prId: string,
    detail: { body: string | null; additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: detail.body,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  // ---- pr_files / pr_commits -------------------------------------------------

  async getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async getPrCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  /** Replace all files for a PR with the freshly-fetched GitHub set. */
  async replacePrFiles(prId: string, files: PrDetail['files']): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length > 0) {
      await this.db.insert(t.prFiles).values(
        files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
    }
  }

  /** Replace all commits for a PR with the freshly-fetched GitHub set. */
  async replacePrCommits(prId: string, commits: PrDetail['commits']): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length > 0) {
      await this.db.insert(t.prCommits).values(
        commits.map((c) => ({
          prId,
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      );
    }
  }

  // ---- PR-list rollups (latest review score, findings, cost) ----------------

  /** Latest `kind='review'` review (id + score) per PR, newest first. */
  async latestReviewsForPulls(
    prIds: string[],
  ): Promise<{ id: string; prId: string; score: number | null }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async findingsForReviews(reviewIds: string[]): Promise<FindingRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds));
  }

  /** Per-PR `(prId, costUsd)` for every agent run ever executed for these PRs. */
  async runCostsForPulls(prIds: string[]): Promise<{ prId: string | null; costUsd: number | null }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds));
  }
}
