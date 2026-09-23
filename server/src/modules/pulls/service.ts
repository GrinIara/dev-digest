import type { Container } from '../../platform/container.js';
import type {
  PrMeta,
  PrDetail,
  PrReviewComment,
  PrCommentInput,
  GitHubClient,
  Severity,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { PullsRepository, type PullRow, type RepoRow } from './repository.js';
import { deriveReviewStatus, rollupSeverities } from './status.js';
import { findingRowToDto } from '../reviews/helpers.js';
import { DIFF_STAT_BACKFILL_LIMIT } from './constants.js';
import type { Logger } from '../reviews/run-executor.js';

/**
 * F1 — pulls service. GitHub PR-list/detail sync, diff-stat backfill, and the
 * PR-list score/findings/cost rollups.
 *
 * No HTTP and no raw SQL live here — persistence goes through PullsRepository,
 * pure transforms through status.ts / reviews/helpers.ts.
 */
export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  private async requireRepoForWorkspace(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repo.getRepoForWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requirePullForWorkspace(workspaceId: string, prId: string): Promise<PullRow> {
    const pr = await this.repo.getForWorkspace(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    return pr;
  }

  /** Best-effort GitHub client — never throws; callers degrade to persisted data. */
  private async tryGithub(log?: Logger): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      log?.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
      return null;
    }
  }

  /**
   * Idempotent upsert of every PR-list item from GitHub. Shared by `listPulls`
   * (best-effort, never fails the read) and `pollRepo` (the manual refresh,
   * which does propagate GitHub errors).
   */
  private async syncPullsFromGitHub(
    workspaceId: string,
    repo: RepoRow,
    gh: GitHubClient,
  ): Promise<number> {
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    for (const pr of pulls) {
      await this.repo.upsertFromGitHub(workspaceId, repo.id, pr);
    }
    return pulls.length;
  }

  // ===========================================================================
  // GET /repos/:id/pulls
  // ===========================================================================

  async listPulls(workspaceId: string, repoId: string, log?: Logger): Promise<PrMeta[]> {
    const repo = await this.requireRepoForWorkspace(workspaceId, repoId);

    // Local-first: sync from GitHub when a token is configured, but never fail
    // the read — already-imported/seeded PRs stay viewable offline.
    const gh = await this.tryGithub(log);
    if (gh) {
      try {
        await this.syncPullsFromGitHub(workspaceId, repo, gh);
      } catch (err) {
        log?.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listForRepo(repo.id);

    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, DIFF_STAT_BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await this.repo.updateDiffStats(r.id, {
            additions: detail.additions,
            deletions: detail.deletions,
            filesCount: detail.files_count,
          });
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          log?.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // Latest-review SCORE per PR for the list's score ring. Computed on read
    // from reviews (no FK denorm); the list is small, so one IN-query + JS
    // grouping is cheap.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { reviewId: string; score: number | null }>();
    const reviewRows = await this.repo.latestReviewsForPulls(prIds);
    // Rows are newest-first → first seen per PR is the latest review.
    for (const rv of reviewRows) {
      if (!latestReviewByPr.has(rv.prId)) {
        latestReviewByPr.set(rv.prId, { reviewId: rv.id, score: rv.score });
      }
    }

    // Findings for each PR's LATEST review only (same scope as SCORE above) —
    // powers the list's FINDINGS column (severity counts) and its hover
    // popover preview (full finding detail, denormalized here to avoid a
    // second round-trip on hover). Counts are plain grouping of these
    // already-fetched rows, never a new LLM call.
    const findingsByPr = new Map<string, ReturnType<typeof findingRowToDto>[]>();
    const latestReviewIds = [...latestReviewByPr.values()].map((v) => v.reviewId);
    if (latestReviewIds.length > 0) {
      const reviewIdToPrId = new Map<string, string>();
      for (const [prId, v] of latestReviewByPr) reviewIdToPrId.set(v.reviewId, prId);

      const findingRows = await this.repo.findingsForReviews(latestReviewIds);
      for (const row of findingRows) {
        const prId = reviewIdToPrId.get(row.reviewId);
        if (!prId) continue;
        const list = findingsByPr.get(prId) ?? [];
        list.push(findingRowToDto(row));
        findingsByPr.set(prId, list);
      }
    }
    // rollupSeverities is the existing pure tally helper (already unit-tested
    // in pulls-status.test.ts) — reused here rather than re-counting inline.
    const findingCountsByPr = new Map<string, Record<Severity, number>>();
    for (const [prId, list] of findingsByPr) {
      const c = rollupSeverities(list);
      findingCountsByPr.set(prId, { CRITICAL: c.critical, WARNING: c.warning, SUGGESTION: c.suggestion });
    }

    // Total cost across EVERY agent run ever executed for the PR (all
    // reviewers, all reruns). Runs with unknown cost (pre-feature rows,
    // errored calls with no usage) are skipped, not zeroed — a PR with no
    // known-cost runs at all gets `undefined` (renders as "—", not "$0.00").
    const costByPr = new Map<string, number>();
    const runRows = await this.repo.runCostsForPulls(prIds);
    for (const run of runRows) {
      if (run.prId == null || run.costUsd == null) continue;
      costByPr.set(run.prId, (costByPr.get(run.prId) ?? 0) + run.costUsd);
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        findings: findingCountsByPr.get(r.id) ?? null,
        latest_findings: findingsByPr.get(r.id) ?? null,
      };
    });
  }

  // ===========================================================================
  // GET /pulls/:id
  // ===========================================================================

  async getPullDetail(workspaceId: string, prId: string, log?: Logger): Promise<PrDetail> {
    const pr = await this.requirePullForWorkspace(workspaceId, prId);
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      await this.repo.replacePrFiles(pr.id, detail.files);
      await this.repo.replacePrCommits(pr.id, detail.commits);
      await this.repo.updateDetail(pr.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });

      return { ...detail, id: pr.id };
    } catch (err) {
      log?.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const files = await this.repo.getPrFiles(pr.id);
      const commits = await this.repo.getPrCommits(pr.id);
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }

  // ===========================================================================
  // POST /repos/:id/poll — manual PR-list-only sync (owned by the polling module)
  // ===========================================================================

  async pollRepo(workspaceId: string, repoId: string): Promise<{ synced: number; reviewTriggered: false }> {
    const repo = await this.requireRepoForWorkspace(workspaceId, repoId);
    const gh = await this.container.github();
    const synced = await this.syncPullsFromGitHub(workspaceId, repo, gh);
    await this.repo.touchRepoPolledAt(repo.id);
    // NOTE: no review is triggered here — manual trigger only.
    return { synced, reviewTriggered: false };
  }

  // ===========================================================================
  // Inline review comments (Files changed tab) — proxied live to GitHub, no
  // local persistence: GET reflects existing PR comments; POST creates one
  // immediately. Keeps the tab in lock-step with GitHub, no stale local mirror.
  // ===========================================================================

  private async resolvePrAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRow; repo: RepoRow }> {
    const pr = await this.requirePullForWorkspace(workspaceId, prId);
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  async listComments(workspaceId: string, prId: string, log?: Logger): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    const gh = await this.tryGithub(log);
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      log?.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async postComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
