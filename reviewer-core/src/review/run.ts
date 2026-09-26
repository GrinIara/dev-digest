import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  ScopedReview,
  ScopeFilterSummary,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema, ScopedReview as ScopedReviewSchema } from '@devdigest/shared';
import { assemblePrompt, type IntentPromptSlot } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { applyScopeFilter } from '../scope.js';
import { reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skills (id + body, NOT slugs) — id is used to label the skill's
   *  block in the prompt trace (`skill:<id>`) for per-skill attribution. */
  skills?: { id: string; body: string }[];
  /** Curated memory items. */
  memory?: string[];
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /**
   * Derived PR intent (T4, intent layer). When present, findings are
   * requested with the `ScopedReview` structured-output schema (each finding
   * carries a `scope` tag) and the post-grounding out-of-scope filter runs
   * (only actually dropping anything when `intent.confidence === 'high'`).
   * Absent → schema/prompt/behavior stay byte-identical to today's (R3).
   */
  intent?: IntentPromptSlot;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
}

export interface ReviewOutcome {
  /** The reduced, GROUNDED review (findings that survived the citation gate). */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Which path ran. */
  mode: ReviewMode;
  /**
   * Prompt assembly (for the run trace) — always a REAL assembly that was
   * actually sent to the LLM. Single-pass: the one call. Map-reduce: the
   * LAST chunk's assembly (never the whole-diff assembly, which is never
   * sent in map-reduce mode). For the full per-chunk detail, see
   * `chunkAssemblies`.
   */
  assembly: PromptAssembly;
  /**
   * Every chunk's actual prompt assembly, in call order. Single-pass has
   * exactly one entry (same as `assembly`); map-reduce has one per file.
   */
  chunkAssemblies: PromptAssembly[];
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
  /** Out-of-scope filter summary (T4); null when there's no intent (the
   *  filter never ran, e.g. the CI runner or no stored intent). */
  scope: ScopeFilterSummary | null;
  /** Findings dropped by the out-of-scope filter, with reasons (mirrors
   *  `dropped` for grounding — never silent). */
  scopeDropped: { finding: Finding; reason: string }[];
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  const totalLines = diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  return totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
  };

  // When an intent is present, request the `ScopedReview` schema so findings
  // carry a `scope` tag; without intent, the schema/prompt stay byte-identical
  // to today's (R3).
  const hasIntent = input.intent != null;
  const schemaName = hasIntent ? 'ScopedReview' : 'Review';

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({ label: f.path, diffText: sliceDiff(input.diff, f.path) }))
      : [{ label: 'all files', diffText: input.diff.raw }];

  // Distinguishing signal: strategy: 'map-reduce' was explicitly requested but
  // downgraded to single-pass because the diff only touches one file (see
  // `selectMode`). Without this, callers can't tell an explicit-but-downgraded
  // run from a normal auto-single-pass run.
  if (input.strategy === 'map-reduce' && mode === 'single-pass') {
    emit(
      'info',
      'strategy "map-reduce" was explicitly requested but downgraded to single-pass ' +
        '(diff touches only 1 file)',
      { downgraded: true, requestedStrategy: 'map-reduce', mode },
    );
  }

  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  const partials: Review[] = [];
  const chunkAssemblies: PromptAssembly[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt({ ...promptParts, diff: chunk.diffText });
    chunkAssemblies.push(a.assembly);
    // Requesting `ScopedReview` (findings carry a `scope` tag) when an intent
    // is present, else the unchanged `Review` schema (R3: byte-identical
    // schema/prompt without intent). `ScopedReview`'s findings structurally
    // satisfy `Finding` (the extra `scope` field is nullish/optional), so
    // pushing into `partials: Review[]` below is safe either way.
    const res = hasIntent
      ? await input.llm.completeStructured<ScopedReview>({
          model: input.model,
          schema: ScopedReviewSchema,
          schemaName,
          messages: a.messages,
          maxRetries,
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        })
      : await input.llm.completeStructured<Review>({
          model: input.model,
          schema: ReviewSchema,
          schemaName,
          messages: a.messages,
          maxRetries,
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        });
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    emit('result', `${chunk.label}: ${res.data.findings.length} candidate finding(s)`);
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Out-of-scope filter (T4) — runs AFTER grounding, drops nothing unless the
  // intent's confidence is 'high' (a weak intent must never suppress findings).
  const scopeResult = applyScopeFilter(ground.kept, {
    enabled: input.intent?.confidence === 'high',
  });
  for (const d of scopeResult.dropped) {
    emit(
      'info',
      `scope filter dropped "${d.finding.title}" (out of scope, ${d.finding.severity})`,
    );
  }
  emit(
    'result',
    `Scope filter: applied=${scopeResult.summary.applied}, kept ${scopeResult.summary.kept_out_of_scope} out-of-scope serious, dropped ${scopeResult.summary.dropped_out_of_scope}`,
  );

  // Score is derived from the findings that SURVIVED grounding AND the scope
  // filter (not the model's self-reported number, and not the pre-filter set)
  // so the score, the findings list, and the deterministic events always agree.
  return {
    review: {
      ...merged,
      findings: scopeResult.kept,
      score: scoreFromFindings(scopeResult.kept),
    },
    grounding,
    dropped: ground.dropped,
    mode,
    // Real assembly that was actually sent — the last chunk's (map-reduce) or
    // the only chunk's (single-pass). Never the whole-diff assembly, which is
    // never sent in map-reduce mode (finding #1).
    assembly: chunkAssemblies[chunkAssemblies.length - 1]!,
    chunkAssemblies,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
    // null when there's no intent — the CI runner and no-intent callers never
    // ran the filter, so the trace should omit it cleanly (R7).
    scope: hasIntent ? scopeResult.summary : null,
    scopeDropped: scopeResult.dropped,
  };
}
