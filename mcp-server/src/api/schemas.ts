import { z } from 'zod';
import type {
  Agent,
  Repo,
  PrMeta,
  ReviewRunResponse,
  RunSummary,
  ReviewRecord,
  ConventionCandidate,
  Finding,
  BlastRadiusResponse,
} from '@devdigest/shared';

/**
 * Local, minimal Zod schemas for the handful of fields each tool actually
 * needs from the running API (A3). Unknown keys are stripped (Zod's default
 * `z.object` behavior), so an API response is never over-trusted just because
 * it happens to carry a `system_prompt` or a full `RunTrace`.
 *
 * Each schema has a compile-time drift guard: `AssertAssignable<Pick<Shared,
 * keys>, Local>` fails `tsc` the moment the real (`@devdigest/shared`) contract
 * for those fields narrows, renames, or drops one this package depends on —
 * before it could silently mis-parse a real response. The check runs in this
 * direction (real type → local type) because our local types are strict
 * PROJECTIONS: they drop fields the tools don't need (`system_prompt`, `id`,
 * `confidence`, `kind`, `trifecta_*`, `review_id`, accept/dismiss timestamps —
 * see plan §6a), so a real API value must always be a superset that satisfies
 * the narrower local shape, not the other way around.
 */
type AssertAssignable<T extends U, U> = T;

export const AgentLite = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type AgentLite = z.infer<typeof AgentLite>;
type _AgentLiteDrift = AssertAssignable<
  Pick<Agent, 'id' | 'name' | 'description' | 'model' | 'enabled'>,
  AgentLite
>;

export const RepoLite = z.object({
  id: z.string(),
  full_name: z.string(),
});
export type RepoLite = z.infer<typeof RepoLite>;
type _RepoLiteDrift = AssertAssignable<Pick<Repo, 'id' | 'full_name'>, RepoLite>;

export const PullLite = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
});
export type PullLite = z.infer<typeof PullLite>;
type _PullLiteDrift = AssertAssignable<Pick<PrMeta, 'id' | 'number'>, PullLite>;

export const ReviewTriggerTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewTriggerTarget = z.infer<typeof ReviewTriggerTarget>;

export const ReviewTriggerResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewTriggerTarget),
});
export type ReviewTriggerResponse = z.infer<typeof ReviewTriggerResponse>;
type _ReviewTriggerResponseDrift = AssertAssignable<
  Pick<ReviewRunResponse, 'pr_id' | 'runs'>,
  ReviewTriggerResponse
>;

export const RunLite = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  findings_count: z.number().int().nullable(),
});
export type RunLite = z.infer<typeof RunLite>;
type _RunLiteDrift = AssertAssignable<
  Pick<RunSummary, 'run_id' | 'agent_id' | 'agent_name' | 'status' | 'error' | 'findings_count'>,
  RunLite
>;

export const FindingLite = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.enum(['bug', 'security', 'perf', 'style', 'test']),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
});
export type FindingLite = z.infer<typeof FindingLite>;
type _FindingLiteDrift = AssertAssignable<
  Pick<
    Finding,
    'severity' | 'category' | 'title' | 'file' | 'start_line' | 'end_line' | 'rationale' | 'suggestion'
  >,
  FindingLite
>;

export const ReviewLite = z.object({
  id: z.string(),
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  created_at: z.string(),
  findings: z.array(FindingLite),
});
export type ReviewLite = z.infer<typeof ReviewLite>;
type _ReviewLiteDrift = AssertAssignable<
  Pick<
    ReviewRecord,
    'id' | 'run_id' | 'agent_id' | 'agent_name' | 'kind' | 'verdict' | 'summary' | 'score' | 'created_at' | 'findings'
  >,
  ReviewLite
>;

export const ConventionLite = z.object({
  id: z.string(),
  category: z.enum(['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general']),
  rule: z.string(),
  rationale: z.string().nullish(),
  evidence_path: z.string(),
  evidence_line: z.number().int().nullish(),
  evidence_snippet: z.string(),
  confidence: z.number(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});
export type ConventionLite = z.infer<typeof ConventionLite>;
type _ConventionLiteDrift = AssertAssignable<
  Pick<
    ConventionCandidate,
    | 'id'
    | 'category'
    | 'rule'
    | 'rationale'
    | 'evidence_path'
    | 'evidence_line'
    | 'evidence_snippet'
    | 'confidence'
    | 'status'
  >,
  ConventionLite
>;

/**
 * `BlastLite` strips the transport-only fields `GET /pulls/:id/blast` also
 * carries (`pr_id`, `indexed_sha`, `limits`, `facts_by_file`) — none of them
 * are needed by the tool's payload (T6). `reason` is a local enum copy rather
 * than importing the shared `BlastDegradedReason` schema at runtime (§6a:
 * `@devdigest/shared` is type-only here).
 */
export const BlastCallerLite = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCallerLite = z.infer<typeof BlastCallerLite>;

export const BlastDownstreamLite = z.object({
  symbol: z.string(),
  callers: z.array(BlastCallerLite),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type BlastDownstreamLite = z.infer<typeof BlastDownstreamLite>;

export const BlastLite = z.object({
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
  downstream: z.array(BlastDownstreamLite),
  summary: z.string(),
  counts: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
  degraded: z.boolean(),
  reason: z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']).nullable(),
  callers_truncated: z.boolean(),
});
export type BlastLite = z.infer<typeof BlastLite>;
type _BlastLiteDrift = AssertAssignable<
  Pick<
    BlastRadiusResponse,
    'changed_symbols' | 'downstream' | 'summary' | 'counts' | 'degraded' | 'reason' | 'callers_truncated'
  >,
  BlastLite
>;

/** `ApiErrorBody` in `@devdigest/shared` (`{ error: { code, message, details } }`). */
export const ApiErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelope>;
