import type { UnifiedDiff } from '@devdigest/shared';
import type { IntentFileHeader } from '@devdigest/reviewer-core';
import { redactUrlCredentials } from '../../platform/redact.js';

/**
 * Pure link-parsing + header-projection helpers for the intent classifier
 * (T5, intent layer). NO container, NO I/O — the caller (`intent-classifier.ts`)
 * turns a `ParsedLink` into a fetch (or an `unreachable`/`unsupported` status).
 *
 * `parseContextLinks`'s doc-path allowlist is the FIRST of two independent
 * traversal defenses (R10): it rejects `..`/absolute/`~`/backslash/NUL paths
 * before a path is ever handed to `SimpleGitClient.readFile`, which
 * independently re-checks the resolved path stays inside the clone root.
 */

const MAX_ISSUES = 3;
const MAX_DOCS = 3;
const MAX_UNSUPPORTED = 5;

const ALLOWED_DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc']);

/** External tracker/doc hosts that are flagged (`unsupported`) but never fetched in v1 (Q1). */
function isUnsupportedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'atlassian.net' ||
    h.endsWith('.atlassian.net') ||
    h === 'jira' ||
    h.startsWith('jira.') ||
    h === 'linear.app' ||
    h.endsWith('.linear.app') ||
    h === 'notion.so' ||
    h.endsWith('.notion.so') ||
    h === 'notion.site' ||
    h.endsWith('.notion.site') ||
    h === 'docs.google.com'
  );
}

const GITHUB_ISSUE_URL_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)(?:[/?#][^\s)]*)?/gi;
const GITHUB_BLOB_URL_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([^\s)]+)/gi;
/** `#123`, `closes #123`, `fixes #123`, `resolves #123` — case-insensitive keyword, optional. */
const ISSUE_HASH_RE = /(?:^|[^\w#])#(\d+)\b/g;
/** A bare relative doc path/link, e.g. `docs/plans/x.md`, `./specs/x.md`.
 *  The leading negative lookbehind is load-bearing (R10): without it,
 *  `matchAll` can start a match mid-string — e.g. `/etc/x.md` gets bitten
 *  down to `etc/x.md` (skipping the leading `/`) and `docs\x.md` gets bitten
 *  down to `x.md` (skipping past the backslash) — both of which then read as
 *  seemingly-valid relative paths to `isValidDocPath`, instead of being
 *  rejected outright. Excluding a word char, `.`, `/`, `\`, `~`, or `-`
 *  immediately before the match start means a match can only begin at a
 *  genuine token boundary (whitespace, quote, paren, string start, …). */
const RELATIVE_DOC_RE =
  /(?<![\w./\\~-])(?:\.{1,2}\/)?[\w][\w.-]*(?:\/[\w][\w.-]*)*\.(?:md|mdx|txt|rst|adoc)\b/gi;
const GENERIC_URL_RE = /https?:\/\/[^\s)]+/gi;

export interface ParsedLinkedIssue {
  kind: 'linked_issue';
  ref: string;
  number: number;
}
export interface ParsedLinkedDoc {
  kind: 'linked_doc';
  ref: string;
  path: string;
}
export interface ParsedUnsupported {
  kind: 'unsupported';
  ref: string;
}
export type ParsedLink = ParsedLinkedIssue | ParsedLinkedDoc | ParsedUnsupported;

function normalizeDocPath(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path;
}

/**
 * Doc-path allowlist (R10): relative, `/`-separated, no `..` segment, no
 * leading `/` or `~`, no backslash/NUL, and an allowed extension. Anything
 * else is silently ignored (not fetched, not recorded) — this is stricter
 * than `unsupported` because it's a hardening boundary, not a "flag it"
 * degradation.
 */
function isValidDocPath(path: string): boolean {
  if (!path) return false;
  if (path.includes('\\') || path.includes('\0')) return false;
  if (path.startsWith('/') || path.startsWith('~')) return false;
  const segments = path.split('/');
  if (segments.some((s) => s === '..')) return false;
  const lastDot = path.lastIndexOf('.');
  if (lastDot < 0) return false;
  const ext = path.slice(lastDot).toLowerCase();
  return ALLOWED_DOC_EXTENSIONS.has(ext);
}

function stripQueryFragment(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return (url.split('?')[0] ?? url).split('#')[0] ?? url;
  }
}

/**
 * Parse linked issue(s) / doc(s) / unsupported-tracker links out of a PR
 * description. Pure — the caller does the actual fetching. Deduped and
 * capped per §0.2 (≤3 issues, ≤3 docs, ≤5 unsupported); the PR's own number
 * is skipped so a PR never "links" itself.
 */
export function parseContextLinks(
  body: string | null,
  repo: { owner: string; name: string },
  prNumber: number,
): ParsedLink[] {
  if (!body) return [];

  const issues: ParsedLinkedIssue[] = [];
  const docs: ParsedLinkedDoc[] = [];
  const unsupported: ParsedUnsupported[] = [];
  const seenIssueNumbers = new Set<number>();
  const seenDocPaths = new Set<string>();
  const seenUnsupportedRefs = new Set<string>();

  const addIssue = (n: number) => {
    if (n === prNumber) return;
    if (seenIssueNumbers.has(n)) return;
    if (issues.length >= MAX_ISSUES) return;
    seenIssueNumbers.add(n);
    issues.push({ kind: 'linked_issue', ref: `#${n}`, number: n });
  };

  const addDoc = (rawPath: string) => {
    const normalized = normalizeDocPath(rawPath);
    if (!isValidDocPath(normalized)) return;
    if (seenDocPaths.has(normalized)) return;
    if (docs.length >= MAX_DOCS) return;
    seenDocPaths.add(normalized);
    docs.push({ kind: 'linked_doc', ref: normalized, path: normalized });
  };

  const addUnsupported = (url: string) => {
    const ref = stripQueryFragment(url);
    if (seenUnsupportedRefs.has(ref)) return;
    if (unsupported.length >= MAX_UNSUPPORTED) return;
    seenUnsupportedRefs.add(ref);
    unsupported.push({ kind: 'unsupported', ref });
  };

  const isSameRepo = (owner: string, name: string) =>
    owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();

  // Full GitHub issue URLs — same-repo -> linked_issue, cross-repo -> unsupported.
  for (const m of body.matchAll(GITHUB_ISSUE_URL_RE)) {
    const [, owner, name, numStr] = m;
    if (!owner || !name || !numStr) continue;
    if (isSameRepo(owner, name)) addIssue(Number(numStr));
    else addUnsupported(m[0]);
  }

  // Full GitHub blob URLs — same-repo -> linked_doc (if the path is allowed),
  // cross-repo -> unsupported.
  for (const m of body.matchAll(GITHUB_BLOB_URL_RE)) {
    const [, owner, name, rest] = m;
    if (!owner || !name || !rest) continue;
    if (isSameRepo(owner, name)) {
      // `<ref>/<path...>` — the ref (branch/sha) is dropped; docs are read
      // from the local clone's default-branch working tree (A4), not the URL's ref.
      const segments = rest.split('/');
      addDoc(segments.slice(1).join('/'));
    } else {
      addUnsupported(m[0]);
    }
  }

  // Bare `#123` / `closes #123` issue references.
  for (const m of body.matchAll(ISSUE_HASH_RE)) {
    if (m[1]) addIssue(Number(m[1]));
  }

  // Bare relative doc paths/links (not already captured as a blob URL).
  for (const m of body.matchAll(RELATIVE_DOC_RE)) {
    addDoc(m[0]);
  }

  // External tracker/doc-host links (flagged, never fetched — Q1).
  for (const m of body.matchAll(GENERIC_URL_RE)) {
    const url = m[0];
    if (/^https?:\/\/github\.com\//i.test(url)) continue; // already classified above
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    if (isUnsupportedHost(host)) addUnsupported(url);
  }

  return [...issues, ...docs, ...unsupported];
}

/**
 * Project a `UnifiedDiff` down to header-only file entries for the
 * classifier (R1): path, +additions/-deletions, hunk headers. Deliberately
 * drops `raw` and `newLineNumbers` so hunk BODY lines can never reach the
 * classifier by construction, not just by prompt-building discipline.
 */
export function toFileHeaders(diff: UnifiedDiff): IntentFileHeader[] {
  return diff.files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    hunks: f.hunks.map((h) => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
    })),
  }));
}

/** Redact URL credentials and cap to 200 chars before an error reaches a
 *  source `detail` or a log line (R8c). */
export function redactDetail(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return redactUrlCredentials(message).slice(0, 200);
}
