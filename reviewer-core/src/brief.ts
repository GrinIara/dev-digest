import type {
  BriefIssueInput,
  BriefMissingInput,
  BriefModelOutput,
  BriefSpecInput,
  ChatMessage,
  Intent,
  LLMProvider,
  SmartDiffRole,
} from '@devdigest/shared';
import { BriefModelOutput as BriefModelOutputSchema } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from './prompt.js';

/**
 * PR risk brief — ONE structured LLM call that turns already-gathered facts
 * (title/description, fetched linked issues, stored intent, blast facts,
 * per-file hunk ranges, Project Context docs) into a summary, risks and a
 * review-focus list. Pure: no I/O beyond the injected `LLMProvider`; the
 * server resolves every input (incl. issue fetches) and grounds the output.
 * The input types carry no patch lines by construction.
 */

export const MAX_DESCRIPTION_CHARS = 8000;
export const MAX_ISSUES = 3;
export const MAX_ISSUE_BODY_CHARS = 4000;
export const MAX_FILES = 200;
export const MAX_HUNKS_PER_FILE = 20;
export const MAX_SPEC_DOC_CHARS = 6000;
export const MAX_BLAST_CHARS = 12000;
/**
 * Output cap for the brief call. It must leave room for reasoning tokens:
 * reasoning models (e.g. deepseek-v4-flash via OpenRouter) count their thinking
 * against `max_tokens`, and at 3000 they spent ~2200 on reasoning and the JSON
 * was cut mid-string ("Unexpected end of JSON input" on every attempt).
 */
export const BRIEF_MAX_OUTPUT_TOKENS = 12000;

const MAX_SUMMARY_SENTENCES = 4;
const MAX_RISKS = 8;
const MAX_FOCUS = 8;

export interface BriefFileFact {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
  hunks: { newStart: number; newLines: number }[];
}

export interface BriefBlastFacts {
  summary: string;
  callers: { symbol: string; name: string; file: string; line: number }[];
  endpoints: string[];
  crons: string[];
  partial: boolean;
}

export interface BriefSpecDoc {
  path: string;
  text: string;
}

/** A linked issue the CALLER has already fetched. */
export interface BriefIssue {
  ref: string;
  title: string;
  body: string;
}

export interface BriefGeneratorInput {
  model: string;
  llm: LLMProvider;
  title: string;
  description?: string | null;
  issues: BriefIssue[];
  intent: Intent | null;
  blast: BriefBlastFacts | null;
  files: BriefFileFact[];
  specs: BriefSpecDoc[];
  missing: BriefMissingInput[];
  timeoutMs?: number;
  sessionId?: string;
}

export interface BriefPromptResult {
  messages: ChatMessage[];
  approxTokens: number;
  specs: BriefSpecInput[];
  issues: BriefIssueInput[];
}

export interface BriefGeneratorOutcome {
  output: BriefModelOutput;
  specs: BriefSpecInput[];
  issues: BriefIssueInput[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  attempts: number;
  approxTokens: number;
}

/**
 * The "Input status" section is trusted text (outside `<untrusted>`), but a
 * missing-input `ref` can originate from the PR author's description. Render
 * only `#<digits>` or a validated URL hostname; anything else renders nothing.
 */
function safeRefToken(ref: string | null): string {
  if (!ref) return '';
  if (/^#\d+$/.test(ref)) return ref;
  try {
    const host = new URL(ref).hostname;
    return /^[a-z0-9.-]+$/i.test(host) ? host : '';
  } catch {
    return '';
  }
}

function renderFileList(files: BriefFileFact[]): string {
  const lines: string[] = [];
  for (const f of files.slice(0, MAX_FILES)) {
    lines.push(`${f.path} (+${f.additions}/-${f.deletions}) [${f.role}]`);
    for (const h of f.hunks.slice(0, MAX_HUNKS_PER_FILE)) {
      lines.push(`  +${h.newStart},${h.newLines}`);
    }
  }
  if (files.length > MAX_FILES) lines.push(`…${files.length - MAX_FILES} more files`);
  return lines.join('\n');
}

function renderIntent(intent: Intent): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (none)');
  return [
    `Summary: ${intent.summary}`,
    `In scope:\n${list(intent.in_scope)}`,
    `Out of scope:\n${list(intent.out_of_scope)}`,
    `Risk areas:\n${list(intent.risk_areas)}`,
  ].join('\n');
}

function renderBlast(blast: BriefBlastFacts): string {
  const lines = [`Summary: ${blast.summary}`];
  if (blast.partial) lines.push('(partial index — facts may be incomplete)');
  if (blast.callers.length) {
    lines.push('Callers:');
    for (const c of blast.callers) lines.push(`- ${c.symbol} ${c.name} ${c.file}:${c.line}`);
  }
  if (blast.endpoints.length) lines.push(`Endpoints: ${blast.endpoints.join(', ')}`);
  if (blast.crons.length) lines.push(`Crons: ${blast.crons.join(', ')}`);
  return lines.join('\n').slice(0, MAX_BLAST_CHARS);
}

/** Assemble the brief prompt (system + one user message of labelled sections). */
export function assembleBriefPrompt(input: BriefGeneratorInput): BriefPromptResult {
  const systemText =
    'Write a risk brief for a pull request. Output only fields of BriefModelOutput ' +
    '(summary, risks, review_focus). `summary`: at most ' + MAX_SUMMARY_SENTENCES +
    ' sentences. `risks`: at most ' + MAX_RISKS + ', each with a title, a severity and ' +
    '`file_refs` written as `path`, `path:N` or `path:A-B`. `review_focus`: at most ' +
    MAX_FOCUS + ' items in the order a reviewer should read them. Cite only files listed ' +
    'under "Changed files"; cited lines must fall inside the listed new-side hunk ranges ' +
    'or on a listed caller line. Any input listed as missing or partial in "Input status" ' +
    'must not be guessed or invented; say so in `summary` if it limits your understanding. ' +
    'Linked issues describe the problem the PR should solve.' +
    '\n\n' +
    INJECTION_GUARD;

  const statusLines = input.missing.map((m) => {
    const token = safeRefToken(m.ref);
    return `${m.input}: ${m.status.toUpperCase()} (${m.reason})${token ? ` ${token}` : ''}`;
  });
  const statusText = `## Input status\n${statusLines.length ? statusLines.join('\n') : 'all inputs available'}`;

  const titleText = `## PR title\n${wrapUntrusted('pr-title', input.title)}`;

  const description = input.description ?? '';
  const descriptionText =
    description.trim().length === 0
      ? '## PR description\n(empty — no description provided)'
      : `## PR description\n${wrapUntrusted('pr-description', description.slice(0, MAX_DESCRIPTION_CHARS))}`;

  const seenIssues = new Set<string>();
  const issues: BriefIssueInput[] = [];
  const issueTexts: string[] = [];
  for (const issue of input.issues) {
    if (seenIssues.has(issue.ref)) continue;
    if (seenIssues.size >= MAX_ISSUES) break;
    seenIssues.add(issue.ref);
    const body = issue.body.slice(0, MAX_ISSUE_BODY_CHARS);
    const content = issue.title ? `${issue.title}\n\n${body}` : body;
    issueTexts.push(
      `## Linked issue ${issue.ref}\n${wrapUntrusted(`linked-issue:${issue.ref}`, content)}`,
    );
    issues.push({ ref: issue.ref, truncated: issue.body.length > MAX_ISSUE_BODY_CHARS });
  }

  const intentText = input.intent
    ? `## Stored intent\n${wrapUntrusted('intent', renderIntent(input.intent))}`
    : '## Stored intent\n(not classified)';

  const blastText = input.blast
    ? `## Blast radius\n${wrapUntrusted('blast', renderBlast(input.blast))}`
    : '## Blast radius\n(unavailable — see Input status)';

  const fileListText = `## Changed files (new-side hunk ranges only — no code)\n${wrapUntrusted('file-list', renderFileList(input.files))}`;

  const seenSpecs = new Set<string>();
  const specs: BriefSpecInput[] = [];
  const specTexts: string[] = [];
  for (const doc of input.specs) {
    if (seenSpecs.has(doc.path)) continue;
    seenSpecs.add(doc.path);
    specTexts.push(
      `## Project document ${doc.path}\n${wrapUntrusted(`spec:${doc.path}`, doc.text.slice(0, MAX_SPEC_DOC_CHARS))}`,
    );
    specs.push({ path: doc.path, truncated: doc.text.length > MAX_SPEC_DOC_CHARS });
  }

  const user = [
    statusText,
    titleText,
    descriptionText,
    ...issueTexts,
    intentText,
    blastText,
    fileListText,
    ...specTexts,
  ].join('\n\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemText },
    { role: 'user', content: user },
  ];
  const approxTokens = Math.ceil((systemText.length + user.length) / 4);
  return { messages, approxTokens, specs, issues };
}

/** Run the brief: assemble the prompt, make exactly one structured call.
 *  Throws on LLM failure — the caller owns error mapping. */
export async function generateBrief(input: BriefGeneratorInput): Promise<BriefGeneratorOutcome> {
  const { messages, approxTokens, specs, issues } = assembleBriefPrompt(input);

  const res = await input.llm.completeStructured<BriefModelOutput>({
    model: input.model,
    schema: BriefModelOutputSchema,
    schemaName: 'BriefModelOutput',
    messages,
    temperature: 0,
    maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
    timeoutMs: input.timeoutMs ?? 60000,
    maxRetries: 2,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return {
    output: res.data,
    specs,
    issues,
    model: res.model,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    attempts: res.attempts,
    approxTokens,
  };
}
