import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings, groundingSummary } from '../src/index.js';

/**
 * groundFindings — the mandatory citation gate. Previously only exercised
 * indirectly (via `run.test.ts`'s end-to-end pipeline) and only for
 * `kind: 'finding'`. This file pins the line-range path AND the
 * evidence-verification path added for `secret_leak`/`lethal_trifecta`
 * (grounding bypass fix — a model self-declaring one of these kinds is no
 * longer enough to skip verification; every `evidence[].line` must be a real
 * diff line, same as a regular finding's range).
 */

function diffWith(files: { path: string; newLineNumbers: number[] }[]): UnifiedDiff {
  return {
    raw: '',
    files: files.map((f) => ({
      path: f.path,
      additions: f.newLineNumbers.length,
      deletions: 0,
      hunks: [
        {
          file: f.path,
          oldStart: f.newLineNumbers[0] ?? 1,
          oldLines: 0,
          newStart: f.newLineNumbers[0] ?? 1,
          newLines: f.newLineNumbers.length,
          newLineNumbers: f.newLineNumbers,
        },
      ],
    })),
  } as UnifiedDiff;
}

function baseFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'f1',
    severity: 'CRITICAL',
    category: 'security',
    title: 'finding',
    file: 'src/config.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.9,
    kind: 'finding',
    ...overrides,
  } as Finding;
}

describe('groundFindings — kind: finding (line-range grounding)', () => {
  it('keeps a finding whose range intersects a diff hunk', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11, 12] }]);
    const result = groundFindings([baseFinding({ start_line: 11, end_line: 11 })], diff);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('drops a finding whose range does not intersect any hunk (hallucinated line)', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11, 12] }]);
    const result = groundFindings([baseFinding({ start_line: 999, end_line: 999 })], diff);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0]!.reason).toMatch(/do not intersect/);
  });

  it('drops a finding whose file is not present in the diff at all', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10] }]);
    const result = groundFindings(
      [baseFinding({ file: 'src/other.ts', start_line: 10, end_line: 10 })],
      diff,
    );
    expect(result.dropped[0]!.reason).toMatch(/not present in diff/);
  });
});

describe('groundFindings — kind: secret_leak / lethal_trifecta require verified evidence', () => {
  it('drops a secret_leak finding with no evidence at all (self-declared kind is not proof)', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11] }]);
    // start_line/end_line are irrelevant for this kind — no line-range check applies.
    const f = baseFinding({ kind: 'secret_leak', start_line: 999, end_line: 999 });
    const result = groundFindings([f], diff);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0]!.reason).toMatch(/requires non-empty evidence/);
  });

  it('keeps a secret_leak finding whose evidence line is a real diff line', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11] }]);
    const f = baseFinding({
      kind: 'secret_leak',
      start_line: 999,
      end_line: 999,
      evidence: [{ component: 'exfil_path', file: 'src/config.ts', line: 11 }],
    });
    const result = groundFindings([f], diff);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('drops a lethal_trifecta finding whose evidence cites a line not in the diff', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11] }]);
    const f = baseFinding({
      kind: 'lethal_trifecta',
      evidence: [{ component: 'exfil_path', file: 'src/config.ts', line: 500 }],
    });
    const result = groundFindings([f], diff);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0]!.reason).toMatch(/does not intersect/);
  });

  it('drops when ANY evidence entry in a multi-component citation fails to ground', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11] }]);
    const f = baseFinding({
      kind: 'lethal_trifecta',
      evidence: [
        { component: 'private_data_access', file: 'src/config.ts', line: 11 }, // real
        { component: 'exfil_path', file: 'src/config.ts', line: 500 }, // hallucinated
      ],
    });
    const result = groundFindings([f], diff);
    expect(result.kept).toHaveLength(0);
  });

  it('drops when an evidence entry cites a file not present in the diff at all', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11] }]);
    const f = baseFinding({
      kind: 'secret_leak',
      evidence: [{ component: 'exfil_path', file: 'src/other.ts', line: 10 }],
    });
    const result = groundFindings([f], diff);
    expect(result.kept).toHaveLength(0);
  });

  it("still requires the finding's OWN `file` to be present in the diff", () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10, 11] }]);
    const f = baseFinding({
      kind: 'secret_leak',
      file: 'src/not-in-diff.ts',
      evidence: [{ component: 'exfil_path', file: 'src/config.ts', line: 11 }],
    });
    const result = groundFindings([f], diff);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped[0]!.reason).toMatch(/not present in diff/);
  });
});

describe('groundFindings — kind: phantom/hook remain full-file exempt (no evidence required)', () => {
  it('keeps a phantom/hook finding once its file is in the diff, without any evidence', () => {
    const diff = diffWith([{ path: 'src/config.ts', newLineNumbers: [10] }]);
    const result = groundFindings(
      [baseFinding({ kind: 'hook', start_line: 999, end_line: 999 })],
      diff,
    );
    expect(result.kept).toHaveLength(1);
  });
});

describe('groundingSummary', () => {
  it('formats kept/total as "kept/total passed"', () => {
    expect(groundingSummary({ kept: [baseFinding({})], dropped: [] })).toBe('1/1 passed');
    expect(
      groundingSummary({ kept: [], dropped: [{ finding: baseFinding({}), reason: 'x' }] }),
    ).toBe('0/1 passed');
  });
});
