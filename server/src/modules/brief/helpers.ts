import type {
  BlastRadius,
  BlastRadiusResponse,
  BriefFocusItem,
  BriefMissingInput,
  BriefModelOutput,
  Risk,
  UnifiedDiff,
} from '@devdigest/shared';
import type { BriefBlastFacts, BriefFileFact, LinkedContext } from '@devdigest/reviewer-core';
import { classifyFile } from '../smart-diff/classify.js';
import type { ParsedLink, ParsedLinkedIssue } from '../reviews/intent-links.js';
import { unsupportedLinkKind } from '../reviews/intent-classifier.js';
import { BRIEF_MAX_FOCUS, BRIEF_MAX_REF_CHARS, BRIEF_MAX_RISKS } from './constants.js';

/**
 * Pure brief helpers: fact shaping, missing-input mapping and output
 * grounding. No Fastify/Drizzle/container access.
 */

// ---- file references --------------------------------------------------------

export interface FileRef {
  path: string;
  start: number | null;
  end: number | null;
}

/** `path`, `path:N` or `path:A-B` → parts; null for an empty path. */
export function parseFileRef(ref: string): FileRef | null {
  const m = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(ref.trim());
  if (!m || !m[1]) return null;
  const start = m[2] !== undefined ? Number(m[2]) : null;
  const end = m[3] !== undefined ? Number(m[3]) : start;
  return { path: m[1], start, end };
}

// ---- allow-list --------------------------------------------------------------

export interface FileAllow {
  ranges: [number, number][];
  callerLines: Set<number>;
}
export type AllowList = Map<string, FileAllow>;

function entry(allow: AllowList, path: string): FileAllow {
  let e = allow.get(path);
  if (!e) {
    e = { ranges: [], callerLines: new Set() };
    allow.set(path, e);
  }
  return e;
}

/** Changed files (new-side hunk ranges, inclusive) + blast caller files/lines. */
export function buildAllowList(
  files: { path: string; hunks: { newStart: number; newLines: number }[] }[],
  callers: { file: string; line: number }[],
): AllowList {
  const allow: AllowList = new Map();
  for (const f of files) {
    const e = entry(allow, f.path);
    for (const h of f.hunks) {
      if (h.newLines > 0) e.ranges.push([h.newStart, h.newStart + h.newLines - 1]);
    }
  }
  for (const c of callers) entry(allow, c.file).callerLines.add(c.line);
  return allow;
}

export function lineAllowed(allow: AllowList, path: string, line: number): boolean {
  const e = allow.get(path);
  if (!e || !Number.isInteger(line) || line < 1) return false;
  return e.callerLines.has(line) || e.ranges.some(([a, b]) => line >= a && line <= b);
}

export function rangeAllowed(allow: AllowList, path: string, start: number, end: number): boolean {
  return start <= end && lineAllowed(allow, path, start) && lineAllowed(allow, path, end);
}

// ---- grounding ---------------------------------------------------------------

export interface GroundedBrief {
  risks: Risk[];
  review_focus: BriefFocusItem[];
  dropped: { risks: number; focus: number };
}

/** R8: filter refs → strip disallowed line parts → drop ref-less / untitled
 *  risks → drop invalid focus items → count drops → cap to 8/8 in order. */
export function groundBriefOutput(output: BriefModelOutput, allow: AllowList): GroundedBrief {
  const risks: Risk[] = [];
  let droppedRisks = 0;
  for (const risk of output.risks) {
    const refs: string[] = [];
    for (const raw of risk.file_refs) {
      const ref = parseFileRef(raw);
      if (!ref || !allow.has(ref.path)) continue;
      const lineOk =
        ref.start !== null &&
        ref.end !== null &&
        rangeAllowed(allow, ref.path, ref.start, ref.end);
      if (ref.start === null || !lineOk) refs.push(ref.path);
      else refs.push(raw.trim());
    }
    if (refs.length === 0 || risk.title.trim().length === 0) {
      droppedRisks++;
      continue;
    }
    risks.push({ ...risk, file_refs: refs });
  }

  const focus: BriefFocusItem[] = [];
  let droppedFocus = 0;
  for (const item of output.review_focus) {
    if (allow.has(item.file) && lineAllowed(allow, item.file, item.line)) focus.push(item);
    else droppedFocus++;
  }

  return {
    risks: risks.slice(0, BRIEF_MAX_RISKS),
    review_focus: focus.slice(0, BRIEF_MAX_FOCUS),
    dropped: { risks: droppedRisks, focus: droppedFocus },
  };
}

// ---- facts -------------------------------------------------------------------

/** Keep only printable ASCII and cap the length: refs land in trusted prompt text. */
export function sanitizeRef(ref: string): string {
  return ref.replace(/[^\x21-\x7e]/g, '').slice(0, BRIEF_MAX_REF_CHARS);
}

export function toFileFacts(
  diff: UnifiedDiff,
  rows: { path: string; additions: number; deletions: number }[],
): BriefFileFact[] {
  const byPath = new Map(diff.files.map((f) => [f.path, f]));
  return rows.map((r) => ({
    path: r.path,
    additions: r.additions,
    deletions: r.deletions,
    role: classifyFile(r.path),
    hunks: (byPath.get(r.path)?.hunks ?? []).map((h) => ({
      newStart: h.newStart,
      newLines: h.newLines,
    })),
  }));
}

export interface BlastFacts {
  facts: BriefBlastFacts | null;
  snapshot: BlastRadius | null;
  missing: BriefMissingInput[];
}

export function blastToFacts(resp: BlastRadiusResponse): BlastFacts {
  if (resp.degraded && resp.reason !== 'index_partial') {
    return {
      facts: null,
      snapshot: null,
      missing: [{ input: 'blast', status: 'missing', reason: resp.reason ?? 'no_data', ref: null }],
    };
  }
  const callers = resp.downstream.flatMap((d) =>
    d.callers.map((c) => ({ symbol: d.symbol, name: c.name, file: c.file, line: c.line })),
  );
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    facts: {
      summary: resp.summary,
      callers,
      endpoints: uniq(resp.downstream.flatMap((d) => d.endpoints_affected)),
      crons: uniq(resp.downstream.flatMap((d) => d.crons_affected)),
      partial: resp.degraded,
    },
    snapshot: {
      changed_symbols: resp.changed_symbols,
      downstream: resp.downstream,
      summary: resp.summary,
    },
    missing: resp.degraded
      ? [{ input: 'blast', status: 'partial', reason: 'index_partial', ref: null }]
      : [],
  };
}

export type SpecsResult =
  | { status: 'none' }
  | { status: 'not_cloned' }
  | { status: 'resolved'; docs: { path: string; text: string }[]; skipped: { path: string; reason: string }[] };

export function specsToMissing(result: SpecsResult): BriefMissingInput[] {
  if (result.status === 'none') {
    return [{ input: 'specs', status: 'missing', reason: 'none_attached', ref: null }];
  }
  if (result.status === 'not_cloned') {
    return [{ input: 'specs', status: 'missing', reason: 'not_cloned', ref: null }];
  }
  return result.skipped.map((s) => ({
    input: 'specs',
    status: 'missing',
    reason: 'doc_missing',
    ref: sanitizeRef(s.path),
  }));
}

// ---- linked issues -------------------------------------------------------------

export function issueLinksToPlan(links: ParsedLink[]): {
  toFetch: ParsedLinkedIssue[];
  unsupported: BriefMissingInput[];
} {
  const toFetch: ParsedLinkedIssue[] = [];
  const unsupported: BriefMissingInput[] = [];
  for (const link of links) {
    if (link.kind === 'linked_issue') toFetch.push(link);
    else if (link.kind === 'unsupported' && unsupportedLinkKind(link.ref) === 'linked_issue') {
      unsupported.push({
        input: 'issue',
        status: 'missing',
        reason: 'unsupported',
        ref: sanitizeRef(link.ref),
      });
    }
  }
  return { toFetch, unsupported };
}

/** `fetched[i]` corresponds to `toFetch[i]`. */
export function issuesToMissing(
  toFetch: ParsedLinkedIssue[],
  fetched: LinkedContext[],
  unsupported: BriefMissingInput[],
): BriefMissingInput[] {
  if (toFetch.length === 0 && unsupported.length === 0) {
    return [{ input: 'issue', status: 'missing', reason: 'none_linked', ref: null }];
  }
  const out: BriefMissingInput[] = [];
  fetched.forEach((f, i) => {
    if (f.status === 'unreachable') {
      out.push({ input: 'issue', status: 'missing', reason: 'unreachable', ref: `#${toFetch[i]!.number}` });
    }
  });
  return [...out, ...unsupported];
}
