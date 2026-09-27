import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { Intent, SmartDiff, BlastRadius } from './brief.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/** Intent persisted for a PR (the Intent plus the pr_id it scopes and the
    classifier metadata needed to detect staleness). */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  model: z.string().nullable(),
  head_sha: z.string().nullable(),
  classified_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Response of `GET /pulls/:id/intent`. `stale` is true when the PR's head
    has moved since `head_sha` was classified against. */
export const PrIntentResponse = z.object({
  intent: PrIntentRecord.nullable(),
  stale: z.boolean(),
});
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;

/** Why a blast response is incomplete; mirrors repo-intel's DegradedReason. */
export const BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastFileFacts = z.object({ endpoints: z.array(z.string()), crons: z.array(z.string()) });
export type BlastFileFacts = z.infer<typeof BlastFileFacts>;

/** Response of `GET /pulls/:id/blast`: the BlastRadius plus read-model metadata. */
export const BlastRadiusResponse = BlastRadius.extend({
  pr_id: z.string(),
  counts: z.object({
    symbols: z.number().int().nonnegative(),
    callers: z.number().int().nonnegative(),
    endpoints: z.number().int().nonnegative(),
    crons: z.number().int().nonnegative(),
  }),
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullable(),
  indexed_sha: z.string().nullable(),
  callers_truncated: z.boolean(),
  limits: z.object({
    max_callers_per_symbol: z.number().int().positive(),
    bfs_depth: z.number().int().positive(),
  }),
  /** Facts per caller file (only files present in `downstream`); feeds the graph view's caller→endpoint edges. */
  facts_by_file: z.record(z.string(), BlastFileFacts),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;
