import type {
  AgentLite,
  BlastLite,
  ConventionLite,
  FindingLite,
  ReviewLite,
  Severity,
  Verdict,
} from './ports.js';
import { BLAST_UNTRUSTED_NOTE, MAX_RESPONSE_CHARS, UNTRUSTED_NOTE } from './tool-result.js';

/** Reserves room for the summary line + envelope punctuation so the whole
 * rendered text (summary + JSON, per `ok()`) stays inside `MAX_RESPONSE_CHARS`
 * even though this module only measures the JSON payload directly. */
const SUMMARY_MARGIN = 500;
const PAYLOAD_BUDGET = MAX_RESPONSE_CHARS - SUMMARY_MARGIN;

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function fitsBudget(payload: unknown): boolean {
  return JSON.stringify(payload).length <= PAYLOAD_BUDGET;
}

function sortFindings(findings: FindingLite[]): FindingLite[] {
  return [...findings].sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    const file = a.file.localeCompare(b.file);
    if (file !== 0) return file;
    return a.start_line - b.start_line;
  });
}

export interface SeverityCounts {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}

function tallyBySeverity(findings: FindingLite[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export interface ConciseFinding {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  lines: string;
  rationale: string;
  suggestion?: string;
}

function toConciseFinding(f: FindingLite, detailed: boolean): ConciseFinding {
  const rationaleCap = detailed ? 1_200 : 300;
  const concise: ConciseFinding = {
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    lines: `${f.start_line}-${f.end_line}`,
    rationale: truncateText(f.rationale, rationaleCap),
  };
  if (detailed && f.suggestion) {
    concise.suggestion = truncateText(f.suggestion, 600);
  }
  return concise;
}

export interface FormatReviewOptions {
  minSeverity?: Severity;
  maxFindings?: number;
  detailed?: boolean;
  runId: string;
  repo: string;
  pr: number;
  agent: string;
  /** `get_findings` includes `created_at`; `run_agent_on_pr` doesn't (§6b). */
  includeCreatedAt?: boolean;
}

export interface FormattedReviewPayload {
  status: 'done';
  run_id: string;
  repo: string;
  pr: number;
  agent: string;
  verdict: Verdict | null;
  score: number | null;
  summary: string | null;
  counts: SeverityCounts;
  findings: ConciseFinding[];
  omitted: number;
  created_at?: string;
}

export interface FormatReviewResult {
  payload: FormattedReviewPayload;
  summary: string;
}

/**
 * Shared by `run_agent_on_pr` and `get_findings` so their outputs are
 * identical in shape. `counts` is always computed over every finding on the
 * review, before the `minSeverity` filter or any truncation — a narrower
 * `min_severity` never changes the totals the model sees.
 */
export function formatReview(review: ReviewLite, opts: FormatReviewOptions): FormatReviewResult {
  const maxFindings = opts.maxFindings ?? 20;
  const detailed = opts.detailed ?? false;
  const counts = tallyBySeverity(review.findings);

  let matched = review.findings;
  if (opts.minSeverity) {
    const threshold = SEVERITY_RANK[opts.minSeverity];
    matched = matched.filter((f) => SEVERITY_RANK[f.severity] <= threshold);
  }
  const sorted = sortFindings(matched);

  let kept = sorted.slice(0, maxFindings);
  let omitted = sorted.length - kept.length;
  let concise = kept.map((f) => toConciseFinding(f, detailed));

  const buildPayload = (): FormattedReviewPayload => ({
    status: 'done',
    run_id: opts.runId,
    repo: opts.repo,
    pr: opts.pr,
    agent: opts.agent,
    verdict: review.verdict,
    score: review.score,
    summary: review.summary === null ? null : truncateText(review.summary, 400),
    counts,
    findings: concise,
    omitted,
    ...(opts.includeCreatedAt ? { created_at: review.created_at } : {}),
  });

  let payload = buildPayload();
  // Enforce the char cap by dropping trailing (lowest-severity, since `sorted`
  // is severity-ascending) findings until the JSON fits — never drops a
  // higher severity while keeping a lower one.
  while (concise.length > 0 && !fitsBudget(payload)) {
    concise = concise.slice(0, -1);
    kept = kept.slice(0, -1);
    omitted += 1;
    payload = buildPayload();
  }

  const summary = buildReviewSummaryLine(payload, opts);
  return { payload, summary };
}

function buildReviewSummaryLine(payload: FormattedReviewPayload, opts: FormatReviewOptions): string {
  const verdictText = payload.verdict ?? 'no verdict yet';
  const scoreText = payload.score ?? 'n/a';
  let line =
    `agent "${opts.agent}" on ${opts.repo}#${opts.pr}: ${verdictText}, score ${scoreText}, ` +
    `${payload.counts.CRITICAL} critical / ${payload.counts.WARNING} warning / ${payload.counts.SUGGESTION} suggestion.`;
  if (payload.omitted > 0) {
    line +=
      ` ${payload.omitted} more finding(s) omitted; call get_findings with repo=${opts.repo}, ` +
      `pr=${opts.pr}, run_id=${opts.runId}, and either a higher min_severity or a larger max_findings (up to 50).`;
  }
  line += ` ${UNTRUSTED_NOTE}`;
  return line;
}

// ---- Conventions -----------------------------------------------------

export interface ConciseConvention {
  category: string;
  rule: string;
  rationale: string;
  evidence: string;
  evidence_snippet?: string;
}

export interface FormatConventionsOptions {
  repo: string;
  category?: string;
  maxRules?: number;
  detailed?: boolean;
}

export interface FormattedConventionsPayload {
  repo: string;
  total_accepted: number;
  pending: number;
  rules: ConciseConvention[];
  omitted: number;
}

export interface FormatConventionsResult {
  payload: FormattedConventionsPayload;
  summary: string;
}

function toConciseConvention(c: ConventionLite, detailed: boolean): ConciseConvention {
  const evidence = c.evidence_line != null ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
  const concise: ConciseConvention = {
    category: c.category,
    rule: c.rule,
    rationale: truncateText(c.rationale ?? '', 200),
    evidence,
  };
  if (detailed) {
    concise.evidence_snippet = truncateText(c.evidence_snippet, 8 * 120);
  }
  return concise;
}

/**
 * `rows` is every candidate for the repo (any status); this filters to
 * `accepted` and reports `pending` as a separate count so a thin result set
 * reads as "nothing accepted yet", not "the feature is broken".
 */
export function formatConventions(
  rows: ConventionLite[],
  opts: FormatConventionsOptions,
): FormatConventionsResult {
  const maxRules = opts.maxRules ?? 25;
  const detailed = opts.detailed ?? false;

  const accepted = rows.filter((r) => r.status === 'accepted');
  const pending = rows.filter((r) => r.status === 'pending').length;

  let matched = opts.category ? accepted.filter((r) => r.category === opts.category) : accepted;
  matched = [...matched].sort((a, b) => b.confidence - a.confidence);

  let kept = matched.slice(0, maxRules);
  let omitted = matched.length - kept.length;
  let rules = kept.map((r) => toConciseConvention(r, detailed));

  const buildPayload = (): FormattedConventionsPayload => ({
    repo: opts.repo,
    total_accepted: accepted.length,
    pending,
    rules,
    omitted,
  });

  let payload = buildPayload();
  while (rules.length > 0 && !fitsBudget(payload)) {
    rules = rules.slice(0, -1);
    kept = kept.slice(0, -1);
    omitted += 1;
    payload = buildPayload();
  }

  const summary = buildConventionsSummaryLine(payload, opts);
  return { payload, summary };
}

function buildConventionsSummaryLine(
  payload: FormattedConventionsPayload,
  opts: FormatConventionsOptions,
): string {
  let line = `${opts.repo}: ${payload.total_accepted} accepted convention(s), ${payload.pending} pending.`;
  if (payload.omitted > 0) {
    line += ` ${payload.omitted} more; call get_conventions with repo=${opts.repo}, category=…, or a larger max_rules (up to 100).`;
  }
  line += ` ${UNTRUSTED_NOTE}`;
  return line;
}

// ---- Agents ------------------------------------------------------------

export interface ConciseAgent {
  id: string;
  name: string;
  description: string;
  model: string;
  enabled: boolean;
}

export interface FormatAgentsResult {
  agents: ConciseAgent[];
  enabledCount: number;
  omitted: number;
}

/** Caps on a single agent's `name`/`model`, mirroring the caps already
 * applied to `description` (160) — an API response is never trusted to keep
 * these short just because the seed data does (R9/security review M4). */
const NAME_CAP = 100;
const MODEL_CAP = 100;

/**
 * `enabledCount` is always computed over every agent the API returned, before
 * any truncation for the char budget — same rule as `formatReview`'s
 * `counts`, so a narrower response never changes the totals the model sees.
 */
export function formatAgents(agents: AgentLite[]): FormatAgentsResult {
  const enabledCount = agents.filter((a) => a.enabled).length;

  let concise = agents.map((a) => ({
    id: a.id,
    name: truncateText(a.name, NAME_CAP),
    description: truncateText(a.description, 160),
    model: truncateText(a.model, MODEL_CAP),
    enabled: a.enabled,
  }));

  let omitted = 0;
  while (concise.length > 0 && !fitsBudget({ agents: concise, omitted })) {
    concise = concise.slice(0, -1);
    omitted += 1;
  }

  return { agents: concise, enabledCount, omitted };
}

// ---- Blast radius --------------------------------------------------------

export interface FormatBlastResult {
  summary: string;
  payload: unknown;
}

/**
 * Shapes `GET /pulls/:id/blast`'s `BlastLite` into the tool's summary + JSON
 * payload (T6/R9). `changed_symbols` in the payload is a flat list of names
 * (capped at 50; `changed_symbols_total` reports the real count) — the tool
 * only needs `downstream` for callers/endpoints/crons, not the full
 * `{name,file,kind}` shape server-side callers get.
 *
 * The budget check here is deliberately per-call (`MAX_RESPONSE_CHARS -
 * summary.length - 1`) rather than the shared `fitsBudget`/`PAYLOAD_BUDGET`
 * margin constant, because the degraded-suffix summary line can itself be
 * long enough to matter for a small payload. The `- 1` accounts for the `\n`
 * `ok()` (`tool-result.ts`) joins the summary and JSON payload with — without
 * it, a payload that exactly fills `MAX_RESPONSE_CHARS - summary.length`
 * pushes the combined `${summary}\n${JSON}` one character over the cap.
 */
export function formatBlast(blast: BlastLite, ctx: { repo: string; pr: number }): FormatBlastResult {
  let summary = blast.summary;
  if (blast.degraded) {
    summary +=
      ` Index incomplete (${blast.reason}): results may miss callers — ` +
      `resync the repo in DevDigest, then retry.`;
  }

  const budget = MAX_RESPONSE_CHARS - summary.length - 1;
  let changedSymbols = blast.changed_symbols.slice(0, 50).map((s) => s.name);
  let downstream = blast.downstream;
  let truncated = false;

  const buildPayload = () => ({
    repo: ctx.repo,
    pr: ctx.pr,
    summary: blast.summary,
    degraded: blast.degraded,
    reason: blast.reason,
    counts: blast.counts,
    callers_truncated: blast.callers_truncated,
    files: blast.files,
    indexed_branch: blast.indexed_branch,
    downstream,
    changed_symbols: changedSymbols,
    changed_symbols_total: blast.changed_symbols.length,
    truncated,
    note: BLAST_UNTRUSTED_NOTE,
  });

  let payload = buildPayload();
  if (JSON.stringify(payload).length > budget) {
    changedSymbols = [];
    truncated = true;
    payload = buildPayload();
  }
  while (downstream.length > 0 && JSON.stringify(payload).length > budget) {
    downstream = downstream.slice(0, -1);
    truncated = true;
    payload = buildPayload();
  }

  return { summary, payload };
}
