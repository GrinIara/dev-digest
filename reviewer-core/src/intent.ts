import type {
  ChatMessage,
  Intent,
  IntentClassification,
  IntentConfidence,
  IntentPromptComponent,
  IntentSource,
  IntentSourceStatus,
  LLMProvider,
} from '@devdigest/shared';
import { IntentClassification as IntentClassificationSchema } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from './prompt.js';

/**
 * Intent classifier — a cheap, separate LLM call that derives a PR's intent
 * (summary, in/out-of-scope, risk areas) from the title, description, linked
 * issue(s)/doc(s), and a header-only changed-files list. Pure (no I/O beyond
 * the injected `LLMProvider`) — all fetching happens in the caller
 * (`server/.../intent-classifier.ts`), which passes already-resolved
 * `LinkedContext` entries in. This keeps the classifier reusable/testable
 * without a DB, mirroring `reviewPullRequest`'s "resolved strings in, LLM
 * injected" contract.
 */

/**
 * Cap the PR description so a huge author body can't blow the token budget.
 * Set well above `MAX_LINKED_DOC_CHARS` (6000): the description is the
 * single most authoritative, always-present source (unlike a linked doc,
 * which may be absent), and PR authors sometimes inline a full plan/spec
 * directly in the PR body rather than only linking to one — this floor is
 * big enough to fit an inlined plan/spec, not just a short blurb.
 */
const MAX_DESCRIPTION_CHARS = 8000;
const MAX_LINKED_ISSUE_CHARS = 4000;
const MAX_LINKED_DOC_CHARS = 6000;
const MAX_FILES = 200;
const MAX_HUNKS_PER_FILE = 20;
const MAX_FILE_LIST_CHARS = 12000;
/** Defensive cap on the model's own output lists (it's still untrusted). */
const MAX_LIST_ITEMS = 10;
const MAX_ITEM_CHARS = 200;

export interface IntentFileHeader {
  path: string;
  additions: number;
  deletions: number;
  hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[];
}

/**
 * A linked issue/doc the CALLER has already fetched (or failed to fetch).
 * `body` is present only when `status` is `'used'` or `'truncated'` — for
 * every other status, no content is rendered (R8c: never fabricate).
 */
export interface LinkedContext {
  kind: 'linked_issue' | 'linked_doc';
  ref: string;
  status: IntentSourceStatus;
  title?: string;
  body?: string;
  detail?: string | null;
}

export interface IntentClassifierInput {
  model: string;
  llm: LLMProvider;
  title: string;
  description?: string | null;
  linked: LinkedContext[];
  files: IntentFileHeader[];
  sessionId?: string;
  timeoutMs?: number;
}

export interface IntentPromptResult {
  messages: ChatMessage[];
  components: IntentPromptComponent[];
  approxTokens: number;
}

export interface IntentClassifierOutcome {
  intent: Intent;
  components: IntentPromptComponent[];
  approxTokens: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  model: string;
}

const approxTokensFor = (chars: number): number => Math.ceil(chars / 4);

function renderFileList(files: IntentFileHeader[]): { text: string; truncated: boolean } {
  let truncated = files.length > MAX_FILES;
  const shown = files.slice(0, MAX_FILES);

  const lines: string[] = [];
  for (const f of shown) {
    lines.push(`${f.path} (+${f.additions}/-${f.deletions})`);
    if (f.hunks.length > MAX_HUNKS_PER_FILE) truncated = true;
    for (const h of f.hunks.slice(0, MAX_HUNKS_PER_FILE)) {
      lines.push(`  @@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    }
  }
  if (files.length > MAX_FILES) {
    lines.push(`…${files.length - MAX_FILES} more files`);
  }

  let text = lines.join('\n');
  if (text.length > MAX_FILE_LIST_CHARS) {
    text = text.slice(0, MAX_FILE_LIST_CHARS);
    truncated = true;
  }
  return { text, truncated };
}

/** Deterministically derive the per-source fetch-outcome list (R1/R8/R9). */
export function buildIntentSources(input: IntentClassifierInput): IntentSource[] {
  const sources: IntentSource[] = [
    { kind: 'title', ref: null, status: 'used', detail: null },
  ];

  const description = input.description ?? '';
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    sources.push({ kind: 'description', ref: null, status: 'empty', detail: null });
  } else if (description.length > MAX_DESCRIPTION_CHARS) {
    sources.push({ kind: 'description', ref: null, status: 'truncated', detail: null });
  } else {
    sources.push({ kind: 'description', ref: null, status: 'used', detail: null });
  }

  for (const link of input.linked) {
    sources.push({
      kind: link.kind,
      ref: link.ref,
      status: link.status,
      detail: link.detail ?? null,
    });
  }

  const { truncated } = renderFileList(input.files);
  sources.push({
    kind: 'file_list',
    ref: null,
    status: truncated ? 'truncated' : 'used',
    detail: null,
  });

  return sources;
}

/**
 * `'high'` iff the description was usable AND no source is
 * unreachable/unsupported (R8a/c, R9). Computed here, never taken from the
 * model — see contract note on `Intent.confidence`.
 */
export function deriveConfidence(sources: IntentSource[]): IntentConfidence {
  const description = sources.find((s) => s.kind === 'description');
  const descriptionOk =
    description != null && (description.status === 'used' || description.status === 'truncated');
  const hasMissing = sources.some(
    (s) => s.status === 'unreachable' || s.status === 'unsupported',
  );
  return descriptionOk && !hasMissing ? 'high' : 'low';
}

/** Assemble the classifier's own prompt (separate from the reviewer's). */
export function assembleIntentPrompt(input: IntentClassifierInput): IntentPromptResult {
  const sources = buildIntentSources(input);
  const components: IntentPromptComponent[] = [];
  const pushComponent = (name: string, text: string) => {
    components.push({ name, chars: text.length, approx_tokens: approxTokensFor(text.length) });
  };

  const systemText =
    "Derive the PR's intent and scope. Output only fields of IntentClassification " +
    "(summary, in_scope, out_of_scope, risk_areas). Use ONLY the material provided. Any " +
    "source listed as UNREACHABLE/UNSUPPORTED/EMPTY in 'Source status' is missing: do NOT " +
    'infer, guess or invent its contents; if missing context limits your understanding, say ' +
    'so in `summary`.' +
    '\n\n' +
    INJECTION_GUARD;
  pushComponent('system', systemText);

  const sourceStatusLines = sources.map((s) => {
    const ref = s.ref ? ` ${s.ref}` : '';
    const detail = s.detail ? ` (${s.detail})` : '';
    return `${s.kind}${ref}: ${s.status.toUpperCase()}${detail}`;
  });
  const sourceStatusText = `## Source status\n${sourceStatusLines.join('\n')}`;
  pushComponent('source_status', sourceStatusText);

  const titleText = `## PR title\n${wrapUntrusted('pr-title', input.title)}`;
  pushComponent('title', titleText);

  const description = input.description ?? '';
  const trimmedDescription = description.trim();
  const descriptionText =
    trimmedDescription.length === 0
      ? '## PR description\n(empty — no description provided)'
      : `## PR description\n${wrapUntrusted('pr-description', description.slice(0, MAX_DESCRIPTION_CHARS))}`;
  pushComponent('description', descriptionText);

  const linkedTexts: string[] = [];
  for (const link of input.linked) {
    // Missing sources never get a rendered body — only the trusted status
    // line above (R8c: never fabricate content for an unreachable/unsupported link).
    if (link.status !== 'used' && link.status !== 'truncated') continue;
    const isIssue = link.kind === 'linked_issue';
    const label = isIssue ? 'Linked issue' : 'Linked document';
    const maxChars = isIssue ? MAX_LINKED_ISSUE_CHARS : MAX_LINKED_DOC_CHARS;
    const body = (link.body ?? '').slice(0, maxChars);
    const content = link.title ? `${link.title}\n\n${body}` : body;
    const wrapLabel = `${isIssue ? 'linked-issue' : 'linked-doc'}:${link.ref}`;
    const sectionText = `## ${label} ${link.ref}\n${wrapUntrusted(wrapLabel, content)}`;
    linkedTexts.push(sectionText);
    pushComponent(`${link.kind}:${link.ref}`, sectionText);
  }

  const { text: fileListBody } = renderFileList(input.files);
  const fileListText = `## Changed files (headers only — no code)\n${wrapUntrusted('file-list', fileListBody)}`;
  pushComponent('file_list', fileListText);

  const user = [sourceStatusText, titleText, descriptionText, ...linkedTexts, fileListText].join(
    '\n\n',
  );

  const messages: ChatMessage[] = [
    { role: 'system', content: systemText },
    { role: 'user', content: user },
  ];

  const approxTokens = components.reduce((sum, c) => sum + c.approx_tokens, 0);
  return { messages, components, approxTokens };
}

function capList(items: string[]): string[] {
  return items.slice(0, MAX_LIST_ITEMS).map((s) => s.slice(0, MAX_ITEM_CHARS));
}

/** Run the classifier: assemble the prompt, call the LLM, and compute the
 *  deterministic confidence + sources. Throws on LLM failure — the caller
 *  (`IntentClassifier.ensureIntent`) is responsible for the non-throwing
 *  degradation path (R8). */
export async function classifyIntent(
  input: IntentClassifierInput,
): Promise<IntentClassifierOutcome> {
  const { messages, components, approxTokens } = assembleIntentPrompt(input);
  const sources = buildIntentSources(input);
  const confidence = deriveConfidence(sources);

  const res = await input.llm.completeStructured<IntentClassification>({
    model: input.model,
    schema: IntentClassificationSchema,
    schemaName: 'IntentClassification',
    messages,
    temperature: 0,
    maxTokens: 800,
    timeoutMs: input.timeoutMs ?? 30000,
    maxRetries: 1,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  const intent: Intent = {
    summary: res.data.summary,
    in_scope: capList(res.data.in_scope),
    out_of_scope: capList(res.data.out_of_scope),
    risk_areas: capList(res.data.risk_areas),
    confidence,
    sources,
  };

  return {
    intent,
    components,
    approxTokens,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    model: res.model,
  };
}
