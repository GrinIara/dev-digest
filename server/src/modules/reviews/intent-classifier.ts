import type { IntentCallTrace, RepoRef, UnifiedDiff } from '@devdigest/shared';
import { classifyIntent, type LinkedContext } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { withTimeout } from '../../platform/resilience.js';
import type * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';
import type { PrIntentRecord } from '@devdigest/shared';
import { parseContextLinks, toFileHeaders, redactDetail } from './intent-links.js';

type RepoRow = typeof schema.repos.$inferSelect;

/** Caps that decide whether a fetched linked source counts as `used` or
 *  `truncated` (§0.2) — mirrored here (not imported) because reviewer-core's
 *  own truncation caps are private; the classifier's OWN char-slicing in
 *  `assembleIntentPrompt` is still the actual content-safety cap either way. */
const MAX_ISSUE_BODY_CHARS = 4000;
const MAX_DOC_BODY_CHARS = 6000;

/**
 * Bound on a single linked-issue GitHub fetch. `GitHubClient.getIssue`'s own
 * adapter already retries + times out at 30s (`octokit.ts`'s `TIMEOUT`), so a
 * slow/unreachable GitHub API could otherwise stall the "cheap classifier"
 * step for tens of seconds per linked issue (up to `MAX_ISSUES` of them) —
 * the opposite of R7's "cheap call" framing. Bounding it here degrades that
 * single source to `unreachable` quickly instead, without touching the
 * shared port/adapter (used by other, unrelated callers).
 */
const GITHUB_ISSUE_FETCH_TIMEOUT_MS = 5000;

/**
 * Overall bound on a fresh classification (`gatherContext` + the classifier's
 * own LLM call) inside `ensureIntent`, AND the per-call LLM timeout `classify()`
 * itself now passes through to `classifyIntent` (see the comment at that call
 * site) — the two must match, or `ensureIntent`'s outer `withTimeout` race
 * gives up on a request that keeps running underneath it uncancelled. Without
 * that inner bound, reviewer-core's `classifyIntent` would default its OWN
 * LLM-call timeout to 30s (reasonable for a direct/CI caller), and up to
 * `MAX_ISSUES`/`MAX_DOCS` sequential fetches could each add more — an
 * unbounded worst case is a poor fit for a step meant to be "cheap" and never
 * block a review (R8). This is a second, coarser bound on top of
 * `GITHUB_ISSUE_FETCH_TIMEOUT_MS`. Side effect: the manual re-classify path
 * (`classify()` called directly from `service.ts`) is now ALSO bounded by
 * this ~8s, not just the background-review path — a user who explicitly
 * clicks "Re-classify" no longer gets the previous ~30s allowance. Revisit if
 * that turns out to be too tight for slower models/providers.
 */
const ENSURE_INTENT_TIMEOUT_MS = 8000;

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : 'unknown';
}

/**
 * Classify an `unsupported` link's source `kind` for the trace/prompt (R8c).
 * `parseContextLinks`'s `ParsedLink['unsupported']` variant only carries a
 * `ref` (no kind) — a cross-repo GitHub issue/blob URL still hints at its
 * origin via its path shape; a generic external tracker URL is classified by
 * host (Jira/Linear read as issue-tracker-ish, Notion/Google Docs as doc-ish).
 */
function unsupportedLinkKind(ref: string): 'linked_issue' | 'linked_doc' {
  if (ref.includes('/issues/')) return 'linked_issue';
  if (ref.includes('/blob/')) return 'linked_doc';
  try {
    const host = new URL(ref).host.toLowerCase();
    if (host.endsWith('atlassian.net') || host.startsWith('jira.') || host.endsWith('linear.app')) {
      return 'linked_issue';
    }
  } catch {
    /* not a parseable URL — fall through to the doc-ish default below */
  }
  return 'linked_doc';
}

/**
 * Fetches linked context (GitHub issues, local-clone docs), runs the
 * reviewer-core classifier, and persists/reuses the result. This is the
 * ONLY place in the intent layer that performs I/O — `intent.ts`
 * (reviewer-core) stays pure, `intent-links.ts` stays pure. `ensureIntent`
 * NEVER throws: every failure degrades to "review without intent" (R8),
 * because intent must never block a review.
 */
export class IntentClassifier {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  /**
   * Resolve every parsed link into a `LinkedContext` the classifier can use:
   * a fetched issue/doc body on success, or an `unreachable` status (with a
   * redacted, capped `detail`) on any failure. Never throws — a single bad
   * link degrades that one source, not the whole classification.
   */
  async gatherContext(pull: PullRow, repoRow: RepoRow): Promise<LinkedContext[]> {
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };
    const links = parseContextLinks(pull.body, ref, pull.number);
    const out: LinkedContext[] = [];

    for (const link of links) {
      if (link.kind === 'linked_issue') {
        try {
          const github = await this.container.github();
          const issue = await withTimeout(
            github.getIssue(ref, link.number),
            GITHUB_ISSUE_FETCH_TIMEOUT_MS,
          );
          const body = issue.body ?? '';
          out.push({
            kind: 'linked_issue',
            ref: link.ref,
            status: body.length > MAX_ISSUE_BODY_CHARS ? 'truncated' : 'used',
            title: issue.title,
            body,
            detail: null,
          });
        } catch (err) {
          out.push({
            kind: 'linked_issue',
            ref: link.ref,
            status: 'unreachable',
            detail: redactDetail(err),
          });
        }
        continue;
      }

      if (link.kind === 'linked_doc') {
        try {
          const body = await this.container.git.readFile(ref, link.path);
          out.push({
            kind: 'linked_doc',
            ref: link.ref,
            status: body.length > MAX_DOC_BODY_CHARS ? 'truncated' : 'used',
            body,
            detail: null,
          });
        } catch (err) {
          out.push({
            kind: 'linked_doc',
            ref: link.ref,
            status: 'unreachable',
            detail: isEnoent(err) ? 'not found in local clone' : redactDetail(err),
          });
        }
        continue;
      }

      // unsupported (Q1: flagged, never fetched in v1) — no I/O.
      out.push({
        kind: unsupportedLinkKind(link.ref),
        ref: link.ref,
        status: 'unsupported',
        detail: 'external tracker not supported',
      });
    }

    return out;
  }

  /**
   * Always runs a fresh classification (used by manual re-classify AND by
   * `ensureIntent` when no row exists yet): gather context → run the
   * reviewer-core classifier on the `review_intent` feature model →
   * persist → re-read the persisted record (so the returned shape always
   * matches exactly what a subsequent GET would return).
   */
  async classify(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    diff: UnifiedDiff,
  ): Promise<{ record: PrIntentRecord; call: IntentCallTrace }> {
    const start = Date.now();
    const linked = await this.gatherContext(pull, repoRow);
    const choice = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(choice.provider);

    const outcome = await classifyIntent({
      model: choice.model,
      llm,
      title: pull.title,
      description: pull.body,
      linked,
      files: toFileHeaders(diff),
      sessionId: `${repoRow.owner}/${repoRow.name}#${pull.number}:intent`,
      // `classifyIntent` otherwise defaults to a 30s LLM-call timeout, but
      // `ensureIntent`'s outer `withTimeout(..., ENSURE_INTENT_TIMEOUT_MS)`
      // gives up waiting after only ~8s WITHOUT cancelling this call — so the
      // LLM request (and the upsertIntent write after it) used to keep
      // running in the background well past the point the run already
      // reported `status: 'failed'`. Passing the same bound here makes the
      // underlying HTTP request itself abort at ~8s (see
      // `OpenRouterProvider.completeStructured` forwarding `timeoutMs` as a
      // per-call `AbortController` timeout), so the two bounds actually
      // coincide instead of one being cosmetic.
      timeoutMs: ENSURE_INTENT_TIMEOUT_MS,
    });

    await this.repo.upsertIntent(pull.id, outcome.intent, {
      model: choice.model,
      headSha: pull.headSha,
    });
    const record = await this.repo.getIntent(pull.id);
    if (!record) {
      // Should be unreachable (we just upserted this row) — guard rather than
      // silently returning a lie to the caller.
      throw new Error('intent: upsertIntent succeeded but getIntent returned nothing');
    }

    const call: IntentCallTrace = {
      status: 'classified',
      provider: choice.provider,
      model: outcome.model,
      duration_ms: Date.now() - start,
      tokens_in: outcome.tokensIn,
      tokens_out: outcome.tokensOut,
      cost_usd: outcome.costUsd,
      approx_prompt_tokens: outcome.approxTokens,
      prompt_components: outcome.components,
      sources: outcome.intent.sources,
      confidence: outcome.intent.confidence,
      error: null,
    };
    return { record, call };
  }

  /**
   * The review-run entry point (R2 A3: manual re-classify only — a stored
   * intent is reused across runs until the user re-triggers it). Reuses a
   * stored row (status `reused`, zero tokens/cost — never double-counted
   * into the agent's own `stats`) or classifies fresh. NEVER throws: any
   * failure degrades to `{ intent: null, call: { status: 'failed', ... } }`
   * and the caller proceeds without intent (R8).
   */
  async ensureIntent(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    diff: UnifiedDiff,
    log: RunLogger,
  ): Promise<{ intent: PrIntentRecord | null; call: IntentCallTrace }> {
    try {
      const existing = await this.repo.getIntent(pull.id);
      if (existing) {
        const call: IntentCallTrace = {
          status: 'reused',
          provider: null,
          model: existing.model,
          duration_ms: 0,
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: null,
          approx_prompt_tokens: 0,
          prompt_components: [],
          sources: existing.sources,
          confidence: existing.confidence,
          error: null,
        };
        this.logOutcome(log, existing.model, call);
        if (existing.head_sha !== null && existing.head_sha !== pull.headSha) {
          log.info(
            `intent: stale (classified at ${shortSha(existing.head_sha)}, PR head is ` +
              `${shortSha(pull.headSha)}) — use Re-classify on the PR page`,
          );
        }
        return { intent: existing, call };
      }

      // Bound the ENTIRE fresh-classification path (link fetches + the LLM
      // call) so a slow/unreachable backend can add at most a few seconds to
      // a review, not the tens-of-seconds worst case of the underlying calls'
      // own (much larger) timeouts — consistent with "intent is a cheap call
      // that never blocks a review" (R8). A timeout here is just another
      // error to this method's existing catch-all below.
      const { record, call } = await withTimeout(
        this.classify(workspaceId, pull, repoRow, diff),
        ENSURE_INTENT_TIMEOUT_MS,
      );
      this.logOutcome(log, call.model, call);
      return { intent: record, call };
    } catch (err) {
      const message = redactDetail(err);
      const call: IntentCallTrace = {
        status: 'failed',
        provider: null,
        model: null,
        duration_ms: 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: null,
        approx_prompt_tokens: 0,
        prompt_components: [],
        sources: [],
        confidence: null,
        error: message,
      };
      log.info(`intent: classification failed — reviewing without intent: ${message}`);
      return { intent: null, call };
    }
  }

  /** R7 observability: model, prompt size + component breakdown, one line per
   *  source, and the deterministic confidence. NEVER logs prompt text, diff
   *  content, or secrets — only sizes/statuses. */
  private logOutcome(log: RunLogger, model: string | null, call: IntentCallTrace): void {
    const components =
      call.prompt_components.length > 0
        ? call.prompt_components.map((c) => `${c.name}:${c.chars}c`).join(', ')
        : 'reused — no new prompt';
    log.info(`intent: model=${model ?? '(reused)'} prompt≈${call.approx_prompt_tokens} tokens (${components})`);
    for (const s of call.sources) {
      const ref = s.ref ? ` ${s.ref}` : '';
      const detail = s.detail ? ` (${s.detail})` : '';
      log.info(`intent: ${s.kind}${ref}: ${s.status}${detail}`);
    }
    log.info(`intent: confidence=${call.confidence ?? 'unknown'}`);
  }
}
