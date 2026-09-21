import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';

/**
 * Reduce + slice helpers for map-reduce reviews. Pure (no DB / `this`), so they
 * live in the engine and are shared by the server and the CI runner.
 */

/**
 * Per-severity penalty subtracted from a perfect 100. Chosen so the score
 * tracks the findings the UI actually shows: 0 findings ⇒ 100, one suggestion
 * ⇒ 97, one warning ⇒ 88, one critical ⇒ 65.
 */
const SEVERITY_PENALTY: Record<Finding['severity'], number> = {
  CRITICAL: 35,
  WARNING: 12,
  SUGGESTION: 3,
};

/**
 * Deterministic 0–100 quality score derived from the (grounded) findings —
 * NOT the model's self-reported `score`, which has no anchor and drifts wildly
 * between models (a cheap model can "approve" with zero findings yet emit 10).
 * This mirrors how the review *event* is already computed from severities in
 * `to-review.ts`, so the number on screen can never contradict the findings
 * beneath it.
 */
export function scoreFromFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

/** Verdict severity order for the reduce step (worst verdict wins). */
const VERDICT_RANK: Record<string, number> = {
  request_changes: 2,
  comment: 1,
  approve: 0,
};

/**
 * Merge N partial Reviews (one per mapped file/chunk) into a single Review:
 * concat findings, take the worst verdict, mean score, joined summaries.
 *
 * NOTE on `score`: this is the mean of each chunk's MODEL-SELF-REPORTED score,
 * computed PRE-grounding. It is provisional/advisory only — the one real call
 * path (`reviewPullRequest` in `review/run.ts`) always overwrites it with
 * `scoreFromFindings(groundedFindings)` before returning, per this package's
 * "never trust the model's self-reported score" rule. Callers that use
 * `reduceReviews` directly (bypassing `reviewPullRequest`) must not treat this
 * field as final — recompute with `scoreFromFindings` after grounding instead.
 */
export function reduceReviews(partials: Review[]): Review {
  if (partials.length === 1) return partials[0]!;
  const findings = partials.flatMap((p) => p.findings);
  let verdict: Review['verdict'] = 'approve';
  for (const p of partials) {
    if ((VERDICT_RANK[p.verdict] ?? 0) > (VERDICT_RANK[verdict] ?? 0)) verdict = p.verdict;
  }
  const score = partials.length
    ? Math.round(partials.reduce((s, p) => s + p.score, 0) / partials.length)
    : 0;
  const summary = partials.map((p) => p.summary).filter(Boolean).join(' ');
  return { verdict, score, summary, findings };
}

/**
 * Extract the slice of the unified diff for a single file (for map chunks).
 * Throws if `path` doesn't match any `diff --git` section AND isn't present
 * in `diff.files` — callers (currently only the map-reduce path in
 * `review/run.ts`, which always derives `path` from `diff.files`) must pass a
 * path that's actually in this diff. Silently falling back to the WHOLE diff
 * here would defeat map-reduce's per-file isolation (each chunk would see
 * every other file's changes) without any signal that it happened.
 */
export function sliceDiff(diff: UnifiedDiff, path: string): string {
  const lines = diff.raw.split('\n');
  const out: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (line.startsWith('diff --git'))
      capture = line.includes(`b/${path}`) || line.includes(` ${path}`);
    if (capture) out.push(line);
  }
  if (out.length > 0) return out.join('\n');
  // fallback: synthesize a minimal header from the file's hunks when the raw
  // diff text doesn't contain a matching `diff --git` section (e.g. a
  // hand-built UnifiedDiff in tests) — but only when the file genuinely is
  // part of this diff.
  const f = diff.files.find((x) => x.path === path);
  if (!f) throw new Error(`sliceDiff: no file matching path "${path}" found in this diff`);
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}`;
}
