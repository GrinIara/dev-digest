import { describe, it, expect } from 'vitest';
import type { Review, UnifiedDiff } from '@devdigest/shared';
import { reduceReviews, sliceDiff } from '../src/index.js';
import { scoreFromFindings } from '../src/review/reduce.js';

/**
 * review/reduce.ts — map-reduce merge logic + the per-file diff slicer.
 * Previously untested (finding #6). Also pins finding #2's fix: `sliceDiff`
 * throws for an unmatched path instead of silently returning the whole diff.
 */

function review(overrides: Partial<Review>): Review {
  return { verdict: 'approve', score: 90, summary: 's', findings: [], ...overrides } as Review;
}

describe('reduceReviews', () => {
  it('returns the single partial unchanged when there is only one', () => {
    const only = review({ verdict: 'request_changes', score: 12, summary: 'only one' });
    expect(reduceReviews([only])).toBe(only);
  });

  it('takes the WORST verdict across partials (request_changes > comment > approve)', () => {
    const merged = reduceReviews([
      review({ verdict: 'approve' }),
      review({ verdict: 'comment' }),
      review({ verdict: 'approve' }),
    ]);
    expect(merged.verdict).toBe('comment');

    const merged2 = reduceReviews([
      review({ verdict: 'comment' }),
      review({ verdict: 'request_changes' }),
      review({ verdict: 'approve' }),
    ]);
    expect(merged2.verdict).toBe('request_changes');
  });

  it('concatenates findings from every partial, preserving order', () => {
    const f1 = { id: 'a' } as never;
    const f2 = { id: 'b' } as never;
    const f3 = { id: 'c' } as never;
    const merged = reduceReviews([
      review({ findings: [f1] }),
      review({ findings: [f2, f3] }),
    ]);
    expect(merged.findings.map((f) => (f as { id: string }).id)).toEqual(['a', 'b', 'c']);
  });

  it('joins non-empty summaries with a space, dropping empty ones', () => {
    const merged = reduceReviews([
      review({ summary: 'first chunk ok' }),
      review({ summary: '' }),
      review({ summary: 'second chunk has issues' }),
    ]);
    expect(merged.summary).toBe('first chunk ok second chunk has issues');
  });

  it("`score` is the MEAN of each partial's self-reported score, rounded", () => {
    const merged = reduceReviews([review({ score: 100 }), review({ score: 61 })]);
    expect(merged.score).toBe(Math.round((100 + 61) / 2));
  });

  // Finding #3: reduceReviews's score is pre-grounding/advisory-only — the
  // real pipeline (review/run.ts) always overwrites it via
  // scoreFromFindings(groundedFindings). Pin that the two are independent
  // computations so a future edit can't silently reintroduce trust in the
  // model's self-reported number.
  it('its score is NOT the same computation as scoreFromFindings (documented as advisory-only)', () => {
    const merged = reduceReviews([review({ score: 100, findings: [] }), review({ score: 5, findings: [] })]);
    // Mean of self-reported scores…
    expect(merged.score).toBe(Math.round((100 + 5) / 2));
    // …vs. the deterministic score the engine actually trusts, from findings:
    expect(scoreFromFindings(merged.findings)).toBe(100);
  });
});

function rawDiffFor(paths: string[]): string {
  return paths
    .map((p) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1,1 +1,1 @@\n+content of ${p}`)
    .join('\n');
}

function diffFor(paths: string[]): UnifiedDiff {
  return {
    raw: rawDiffFor(paths),
    files: paths.map((p) => ({
      path: p,
      additions: 1,
      deletions: 0,
      hunks: [{ file: p, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, newLineNumbers: [1] }],
    })),
  } as UnifiedDiff;
}

describe('sliceDiff', () => {
  it('extracts only the requested file\'s diff --git section from a multi-file raw diff', () => {
    const diff = diffFor(['a.ts', 'b.ts']);
    const slice = sliceDiff(diff, 'a.ts');
    expect(slice).toContain('content of a.ts');
    expect(slice).not.toContain('content of b.ts');
    expect(slice).not.toContain('diff --git a/b.ts');
  });

  it('synthesizes a minimal header when raw text has no matching `diff --git` but the file IS in diff.files', () => {
    const diff: UnifiedDiff = {
      raw: 'this raw text has no diff --git markers at all',
      files: [{ path: 'only.ts', additions: 1, deletions: 0, hunks: [] }],
    } as UnifiedDiff;
    const slice = sliceDiff(diff, 'only.ts');
    expect(slice).toBe('diff --git a/only.ts b/only.ts\n--- a/only.ts\n+++ b/only.ts');
  });

  it('throws instead of silently returning the whole diff when the path matches nothing (finding #2)', () => {
    const diff = diffFor(['a.ts', 'b.ts']);
    expect(() => sliceDiff(diff, 'nonexistent.ts')).toThrow(/no file matching path/);
  });
});
