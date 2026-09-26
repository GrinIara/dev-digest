/**
 * intent-links.ts — pure link parsing + header projection for the intent
 * classifier (T5). Pins the linked-issue/doc parsing rules, the external-
 * tracker flagging, and the doc-path traversal allowlist (R10).
 */
import { describe, it, expect } from 'vitest';
import { parseContextLinks, toFileHeaders } from '../src/modules/reviews/intent-links.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const repo = { owner: 'acme', name: 'payments-api' };

describe('parseContextLinks — linked issues', () => {
  it('parses a bare #12 reference', () => {
    const links = parseContextLinks('See #12 for context.', repo, 482);
    expect(links).toContainEqual({ kind: 'linked_issue', ref: '#12', number: 12 });
  });

  it('parses "closes #12"', () => {
    const links = parseContextLinks('closes #12', repo, 482);
    expect(links).toContainEqual({ kind: 'linked_issue', ref: '#12', number: 12 });
  });

  it('parses a full same-repo GitHub issue URL', () => {
    const links = parseContextLinks(
      'https://github.com/acme/payments-api/issues/12',
      repo,
      482,
    );
    expect(links).toContainEqual({ kind: 'linked_issue', ref: '#12', number: 12 });
  });

  it("skips the PR's own number", () => {
    const links = parseContextLinks('closes #482, see also #12', repo, 482);
    const numbers = links.filter((l) => l.kind === 'linked_issue').map((l) => l.number);
    expect(numbers).not.toContain(482);
    expect(numbers).toContain(12);
  });

  it('a cross-repo GitHub issue URL is unsupported, not a linked_issue', () => {
    const links = parseContextLinks(
      'https://github.com/other-org/other-repo/issues/9',
      repo,
      482,
    );
    expect(links.some((l) => l.kind === 'linked_issue')).toBe(false);
    const unsupported = links.find((l) => l.kind === 'unsupported');
    expect(unsupported).toBeDefined();
    expect(unsupported!.ref).toContain('other-org/other-repo/issues/9');
  });

  it('a cross-repo GitHub blob URL is unsupported, not a linked_doc', () => {
    const links = parseContextLinks(
      'https://github.com/other-org/other-repo/blob/main/docs/plan.md',
      repo,
      482,
    );
    // The URL is classified ONLY as 'unsupported' via GITHUB_BLOB_URL_RE —
    // RELATIVE_DOC_RE's leading negative lookbehind (`(?<![\w./\\~-])`)
    // stops it from ALSO re-matching a tail of the same URL text (e.g.
    // "github.com/other-org/other-repo/blob/main/docs/plan.md") as a
    // second, spurious 'linked_doc' entry.
    expect(links.some((l) => l.kind === 'linked_doc')).toBe(false);
    expect(links.some((l) => l.kind === 'unsupported')).toBe(true);
  });
});

describe('parseContextLinks — external trackers (unsupported, query/fragment stripped)', () => {
  it('flags a Jira URL as unsupported with the query string stripped from ref', () => {
    const links = parseContextLinks(
      'Spec: https://acme.atlassian.net/browse/PROJ-123?foo=bar&baz=qux',
      repo,
      482,
    );
    const unsupported = links.find((l) => l.kind === 'unsupported');
    expect(unsupported).toBeDefined();
    expect(unsupported!.ref).toBe('https://acme.atlassian.net/browse/PROJ-123');
    expect(unsupported!.ref).not.toContain('?');
    expect(unsupported!.ref).not.toContain('foo=bar');
  });
});

describe('parseContextLinks — doc-path traversal allowlist (R10)', () => {
  it('rejects "../../.devdigest/secrets.json" (disallowed extension, never a linked_doc)', () => {
    const links = parseContextLinks(
      'See ../../.devdigest/secrets.json for the config.',
      repo,
      482,
    );
    expect(links.some((l) => l.kind === 'linked_doc')).toBe(false);
  });

  it('rejects "/etc/passwd" (no allowed doc extension, never a linked_doc)', () => {
    const links = parseContextLinks('Read /etc/passwd for details.', repo, 482);
    expect(links.some((l) => l.kind === 'linked_doc')).toBe(false);
  });

  it('rejects an absolute path with an allowed extension outright, not as a truncated relative path', () => {
    const links = parseContextLinks('See /etc/x.md for details.', repo, 482);
    // Intended spec (R10): an absolute path must be ignored entirely, never
    // resolved to some other relative path inside the repo.
    // `RELATIVE_DOC_RE`'s leading negative lookbehind (a `/` immediately
    // before the match start is excluded) stops the match from starting
    // mid-string at "etc/x.md" (skipping the leading `/`), so no relative
    // doc is extracted from this absolute path.
    expect(links.some((l) => l.kind === 'linked_doc')).toBe(false);
  });

  it('rejects a backslash-separated path outright, not as a truncated relative path', () => {
    const links = parseContextLinks('See docs\\x.md for details.', repo, 482);
    // Same intended spec as above: a backslash-containing ref must never
    // resolve to a linked_doc. The lookbehind also excludes a `\` immediately
    // before the match start, so the match can't begin mid-string at "x.md"
    // (skipping past the backslash).
    expect(links.some((l) => l.kind === 'linked_doc')).toBe(false);
  });

  it('accepts a well-formed relative doc path', () => {
    const links = parseContextLinks('See docs/plans/x.md for the plan.', repo, 482);
    expect(links).toContainEqual({
      kind: 'linked_doc',
      ref: 'docs/plans/x.md',
      path: 'docs/plans/x.md',
    });
  });
});

describe('toFileHeaders', () => {
  it('projects a UnifiedDiff to header-only entries with no raw or newLineNumbers fields', () => {
    const raw =
      'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
    const diff = parseUnifiedDiff(raw);

    const headers = toFileHeaders(diff);

    expect(headers).toHaveLength(1);
    expect(headers[0]!.path).toBe('src/config.ts');
    expect(Object.prototype.hasOwnProperty.call(headers[0], 'raw')).toBe(false);
    expect(headers[0]!.hunks.length).toBeGreaterThan(0);
    for (const hunk of headers[0]!.hunks) {
      expect(Object.prototype.hasOwnProperty.call(hunk, 'newLineNumbers')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(hunk, 'raw')).toBe(false);
    }
  });
});
