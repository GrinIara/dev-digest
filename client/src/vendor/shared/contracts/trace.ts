import { z } from 'zod';
import { IntentConfidence, IntentSource } from './brief.js';

/**
 * Run trace. The ENTIRE trace of one run is persisted as a SINGLE
 * jsonb document in `run_traces` (not per-row). Live events stream via SSE
 * during the run; the full log is written once on completion.
 */

export const RunEventKind = z.enum(['info', 'tool', 'result', 'error']);
export type RunEventKind = z.infer<typeof RunEventKind>;

/** A single live-log line. `t` = elapsed timestamp string (e.g. "00.31"). */
export const RunLogLine = z.object({
  t: z.string(),
  kind: RunEventKind,
  msg: z.string(),
});
export type RunLogLine = z.infer<typeof RunLogLine>;

/** SSE payload streamed on `/runs/:id/events`. */
export const RunEvent = z.object({
  runId: z.string(),
  seq: z.number().int(),
  kind: RunEventKind,
  msg: z.string(),
  t: z.string(),
  data: z.unknown().optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;

export const ToolCall = z.object({
  tool: z.string(),
  args: z.string(),
  meta: z.string().nullish(),
  ms: z.number().int(),
});
export type ToolCall = z.infer<typeof ToolCall>;

export const PromptAssembly = z.object({
  system: z.string(),
  skills: z.string().nullish(),
  memory: z.string().nullish(),
  specs: z.string().nullish(),
  /** Callers-of-changed-symbols digest (T1.3); null when absent. */
  callers: z.string().nullish(),
  /** Repo skeleton / map (T3); null when absent. Enables per-slot token
      attribution in the run trace. */
  repo_map: z.string().nullish(),
  /** PR author's description/body (truncated); null when absent. */
  pr_description: z.string().nullish(),
  /** Declared intent & scope block (untrusted-wrapped); null when absent. */
  intent: z.string().nullish(),
  user: z.string(),
});
export type PromptAssembly = z.infer<typeof PromptAssembly>;

export const MemoryPulled = z.object({
  pr: z.number().int().nullish(),
  text: z.string(),
});
export type MemoryPulled = z.infer<typeof MemoryPulled>;

/** Per-prompt-section char/token attribution for the intent classifier call. */
export const IntentPromptComponent = z.object({
  name: z.string(),
  chars: z.number().int(),
  approx_tokens: z.number().int(),
});
export type IntentPromptComponent = z.infer<typeof IntentPromptComponent>;

/** Observability record for the intent classifier's own (cheap) LLM call —
    kept separate from the agent's own `stats`, so classifier tokens/cost
    are never double-counted into a review's totals. */
export const IntentCallTrace = z.object({
  status: z.enum(['classified', 'reused', 'failed']),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  approx_prompt_tokens: z.number().int(),
  prompt_components: z.array(IntentPromptComponent),
  sources: z.array(IntentSource),
  confidence: IntentConfidence.nullable(),
  error: z.string().nullable(),
});
export type IntentCallTrace = z.infer<typeof IntentCallTrace>;

/** Counts from the post-grounding out-of-scope filter (T4). */
export const ScopeFilterSummary = z.object({
  applied: z.boolean(),
  kept_out_of_scope: z.number().int(),
  dropped_out_of_scope: z.number().int(),
});
export type ScopeFilterSummary = z.infer<typeof ScopeFilterSummary>;

export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /** USD cost of this run's LLM calls; null when unknown. */
  cost_usd: z.number().nullable(),
  findings: z.number().int(),
  grounding: z.string(),
});
export type RunStats = z.infer<typeof RunStats>;

/** The single-document trace stored in `run_traces.trace`. */
export const RunTrace = z.object({
  config: z.object({
    agent: z.string(),
    version: z.string().nullish(),
    provider: z.string().nullish(),
    model: z.string(),
    pr: z.number().int().nullish(),
    source: z.enum(['local', 'ci']).default('local'),
  }),
  stats: RunStats,
  prompt_assembly: PromptAssembly,
  tool_calls: z.array(ToolCall),
  raw_output: z.string(),
  memory_pulled: z.array(MemoryPulled),
  specs_read: z.array(z.string()),
  log: z.array(RunLogLine),
  /** The intent classifier's own call trace; nullish so old persisted traces
      (before the intent layer) still parse. */
  intent_call: IntentCallTrace.nullish(),
  /** Out-of-scope filter summary; nullish so old persisted traces still
      parse and so no-intent runs (e.g. the CI runner) omit it cleanly. */
  scope_filter: ScopeFilterSummary.nullish(),
});
export type RunTrace = z.infer<typeof RunTrace>;

/**
 * One row of a PR's run history (every agent_runs row, any status). Surfaced on
 * the PR page so runs — including FAILED ones with their error — survive reload.
 */
export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string().nullable(), // running | done | failed | cancelled
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** USD cost of this run's LLM calls; null when unknown. */
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  // Review outcome, denormalized onto the run row at completion (the timeline
  // has no FK to the review). score = the review's 0-100 score; blockers =
  // findings that trip the agent's gate. Null on failed/cancelled runs.
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;
