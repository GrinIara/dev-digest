import { describe, it, expect } from 'vitest';
import type { BlastRadiusResponse, BriefModelOutput } from '@devdigest/shared';
import {
  blastToFacts,
  buildAllowList,
  groundBriefOutput,
  issueLinksToPlan,
  issuesToMissing,
  parseFileRef,
  specsToMissing,
} from '../src/modules/brief/helpers.js';
import { parseContextLinks } from '../src/modules/reviews/intent-links.js';

const risk = (title: string, file_refs: string[]) => ({
  kind: 'k',
  title,
  explanation: 'e',
  severity: 'high' as const,
  file_refs,
});
const out = (o: Partial<BriefModelOutput>): BriefModelOutput => ({
  summary: 's',
  risks: [],
  review_focus: [],
  ...o,
});
const allow = buildAllowList(
  [
    { path: 'src/api/users.ts', hunks: [{ newStart: 40, newLines: 13 }] },
    { path: 'src/x.ts', hunks: [{ newStart: 1, newLines: 5 }] },
  ],
  [{ file: 'src/api/users.ts', line: 53 }, { file: 'src/caller.ts', line: 9 }],
);

describe('SPEC-2026-09-30-pr-risk-brief', () => {
  it('AC-18: risks without a title or any ref are dropped', () => {
    const g = groundBriefOutput(
      out({ risks: [risk('  ', ['src/x.ts']), risk('ok', ['src/x.ts']), risk('none', [])] }),
      allow,
    );
    expect(g.risks.map((r) => r.title)).toEqual(['ok']);
    expect(g.dropped.risks).toBe(2);
  });

  it('AC-22: invented paths are removed, changed and caller files kept', () => {
    const g = groundBriefOutput(
      out({ risks: [risk('t', ['src/invented.ts', 'src/api/users.ts', 'src/caller.ts'])] }),
      allow,
    );
    expect(g.risks[0]!.file_refs).toEqual(['src/api/users.ts', 'src/caller.ts']);
  });

  it('AC-23: a risk whose only ref was invented is dropped', () => {
    const g = groundBriefOutput(out({ risks: [risk('t', ['src/invented.ts:3'])] }), allow);
    expect(g.risks).toEqual([]);
    expect(g.dropped.risks).toBe(1);
  });

  it('AC-24: a line outside every hunk is stripped, the path kept', () => {
    const g = groundBriefOutput(
      out({ risks: [risk('t', ['src/x.ts:900-905', 'src/x.ts:2-3', 'src/x.ts:4-9'])] }),
      allow,
    );
    expect(g.risks[0]!.file_refs).toEqual(['src/x.ts', 'src/x.ts:2-3', 'src/x.ts']);
  });

  it('AC-25: focus items for unknown files are dropped', () => {
    const g = groundBriefOutput(
      out({ review_focus: [{ file: 'src/invented.ts', line: 3, reason: 'r' }] }),
      allow,
    );
    expect(g.review_focus).toEqual([]);
    expect(g.dropped.focus).toBe(1);
  });

  it('AC-26: hunk +40,13 keeps line 52; drops 53 unless it is a caller line', () => {
    const g = groundBriefOutput(
      out({
        review_focus: [
          { file: 'src/api/users.ts', line: 52, reason: 'r' },
          { file: 'src/api/users.ts', line: 54, reason: 'r' },
          { file: 'src/x.ts', line: 6, reason: 'r' },
        ],
      }),
      allow,
    );
    expect(g.review_focus.map((f) => f.line)).toEqual([52]);
    const only = buildAllowList([{ path: 'a.ts', hunks: [{ newStart: 40, newLines: 13 }] }], []);
    expect(
      groundBriefOutput(
        out({ review_focus: [{ file: 'a.ts', line: 53, reason: 'r' }, { file: 'a.ts', line: 52, reason: 'r' }] }),
        only,
      ).review_focus.map((f) => f.line),
    ).toEqual([52]);
    // 53 as a blast caller line in users.ts is allowed
    expect(
      groundBriefOutput(out({ review_focus: [{ file: 'src/api/users.ts', line: 53, reason: 'r' }] }), allow)
        .review_focus,
    ).toHaveLength(1);
  });

  it('AC-28: caps at 8 risks and 8 focus items in order', () => {
    const risks = Array.from({ length: 11 }, (_, i) => risk(`r${i}`, ['src/x.ts']));
    const review_focus = Array.from({ length: 11 }, (_, i) => ({ file: 'src/x.ts', line: 1 + (i % 5), reason: `f${i}` }));
    const g = groundBriefOutput(out({ risks, review_focus }), allow);
    expect(g.risks.map((r) => r.title)).toEqual(risks.slice(0, 8).map((r) => r.title));
    expect(g.review_focus.map((f) => f.reason)).toEqual(review_focus.slice(0, 8).map((f) => f.reason));
  });
});

describe('brief helpers', () => {
  it('parseFileRef handles path, path:N, path:A-B', () => {
    expect(parseFileRef('a/b.ts')).toEqual({ path: 'a/b.ts', start: null, end: null });
    expect(parseFileRef('a/b.ts:7')).toEqual({ path: 'a/b.ts', start: 7, end: 7 });
    expect(parseFileRef('a/b.ts:7-9')).toEqual({ path: 'a/b.ts', start: 7, end: 9 });
    expect(parseFileRef('')).toBeNull();
  });

  const blast = (over: Partial<BlastRadiusResponse>): BlastRadiusResponse =>
    ({
      pr_id: 'p', changed_symbols: [], summary: 'sum',
      downstream: [{ symbol: 's', callers: [{ name: 'c', file: 'f.ts', line: 3 }], endpoints_affected: ['GET /a'], crons_affected: [] }],
      counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
      degraded: false, reason: null, ...over,
    }) as BlastRadiusResponse;

  it('blastToFacts maps degraded reasons', () => {
    const missing = blastToFacts(blast({ degraded: true, reason: 'flag_off' }));
    expect(missing.facts).toBeNull();
    expect(missing.missing).toEqual([{ input: 'blast', status: 'missing', reason: 'flag_off', ref: null }]);
    const partial = blastToFacts(blast({ degraded: true, reason: 'index_partial' }));
    expect(partial.facts?.callers).toHaveLength(1);
    expect(partial.missing[0]).toMatchObject({ status: 'partial', reason: 'index_partial' });
    const ok = blastToFacts(blast({}));
    expect(ok.missing).toEqual([]);
    expect(ok.facts?.endpoints).toEqual(['GET /a']);
  });

  it('specsToMissing maps none, not_cloned and unreadable docs', () => {
    expect(specsToMissing({ status: 'none' })[0]).toMatchObject({ reason: 'none_attached' });
    expect(specsToMissing({ status: 'not_cloned' })[0]).toMatchObject({ reason: 'not_cloned' });
    expect(
      specsToMissing({ status: 'resolved', docs: [], skipped: [{ path: 'docs/gone.md', reason: 'unreadable' }] }),
    ).toEqual([{ input: 'specs', status: 'missing', reason: 'doc_missing', ref: 'docs/gone.md' }]);
  });

  const plan = (body: string) =>
    issueLinksToPlan(parseContextLinks(body, { owner: 'acme', name: 'api' }, 1));

  it('issue plan: none_linked only when nothing is linked', () => {
    const p = plan('no links here');
    expect(issuesToMissing(p.toFetch, [], p.unsupported)).toEqual([
      { input: 'issue', status: 'missing', reason: 'none_linked', ref: null },
    ]);
  });

  it('issue plan: Jira is unsupported, Notion yields no entry', () => {
    const p = plan('see https://acme.atlassian.net/browse/X-1');
    expect(p.toFetch).toEqual([]);
    expect(p.unsupported).toEqual([
      { input: 'issue', status: 'missing', reason: 'unsupported', ref: 'https://acme.atlassian.net/browse/X-1' },
    ]);
    const n = plan('see https://www.notion.so/page-1');
    expect(n.unsupported).toEqual([]);
    expect(issuesToMissing(n.toFetch, [], n.unsupported)[0]?.reason).toBe('none_linked');
  });

  it('issue plan: unreachable fetch gets #N ref', () => {
    const p = plan('closes #12');
    expect(p.toFetch).toHaveLength(1);
    expect(
      issuesToMissing(p.toFetch, [{ kind: 'linked_issue', ref: '#12', status: 'unreachable', detail: 'x' }], p.unsupported),
    ).toEqual([{ input: 'issue', status: 'missing', reason: 'unreachable', ref: '#12' }]);
  });
});
