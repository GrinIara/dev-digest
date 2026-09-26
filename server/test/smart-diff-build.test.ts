import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import {
  buildSmartDiff,
  selectLatestReviewPerAgent,
  type SmartDiffInputFile,
  type SmartDiffInputFinding,
} from '../src/modules/smart-diff/helpers.js';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/smart-diff/constants.js';

describe('buildSmartDiff (pure, R3)', () => {
  it('orders groups by SMART_DIFF_ROLE_ORDER regardless of input file order', () => {
    // boilerplate file listed first in the input, core file listed last
    const files: SmartDiffInputFile[] = [
      { path: 'pnpm-lock.yaml', additions: 10, deletions: 0 },
      { path: 'src/config.ts', additions: 4, deletions: 1 },
    ];
    const result = buildSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'boilerplate']);
    // Sanity: the role order itself is core, tests, wiring, docs, boilerplate.
    expect(SMART_DIFF_ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });

  it('omits empty groups', () => {
    const files: SmartDiffInputFile[] = [{ path: 'src/config.ts', additions: 1, deletions: 0 }];
    const result = buildSmartDiff(files, []);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.role).toBe('core');
  });

  it('preserves in-group input order', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'src/b.ts', additions: 1, deletions: 0 },
      { path: 'src/a.ts', additions: 1, deletions: 0 },
    ];
    const result = buildSmartDiff(files, []);
    expect(result.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('dedupes and sorts finding_lines ([52,28,28] -> [28,52])', () => {
    const files: SmartDiffInputFile[] = [{ path: 'src/config.ts', additions: 1, deletions: 0 }];
    const findings: SmartDiffInputFinding[] = [
      { file: 'src/config.ts', startLine: 52, dismissedAt: null },
      { file: 'src/config.ts', startLine: 28, dismissedAt: null },
      { file: 'src/config.ts', startLine: 28, dismissedAt: null },
    ];
    const result = buildSmartDiff(files, findings);
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([28, 52]);
  });

  it('excludes dismissed findings', () => {
    const files: SmartDiffInputFile[] = [{ path: 'src/config.ts', additions: 1, deletions: 0 }];
    const findings: SmartDiffInputFinding[] = [
      { file: 'src/config.ts', startLine: 5, dismissedAt: new Date('2026-01-01') },
      { file: 'src/config.ts', startLine: 9, dismissedAt: null },
    ];
    const result = buildSmartDiff(files, findings);
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([9]);
  });

  it('ignores findings for paths not in the file list', () => {
    const files: SmartDiffInputFile[] = [{ path: 'src/config.ts', additions: 1, deletions: 0 }];
    const findings: SmartDiffInputFinding[] = [
      { file: 'src/other.ts', startLine: 5, dismissedAt: null },
    ];
    const result = buildSmartDiff(files, findings);
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([]);
  });

  it('sums total_lines over additions + deletions of every file', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'src/config.ts', additions: 4, deletions: 1 },
      { path: 'src/config.test.ts', additions: 12, deletions: 0 },
    ];
    const result = buildSmartDiff(files, []);
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 17, proposed_splits: [] });
  });

  it('produces a result that passes SmartDiff.parse', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'src/config.ts', additions: 4, deletions: 1 },
      { path: 'src/config.test.ts', additions: 12, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 100, deletions: 0 },
    ];
    const findings: SmartDiffInputFinding[] = [
      { file: 'src/config.ts', startLine: 5, dismissedAt: null },
    ];
    const result = buildSmartDiff(files, findings);
    expect(() => SmartDiff.parse(result)).not.toThrow();
  });
});

describe('selectLatestReviewPerAgent (pure, R3/A2)', () => {
  interface R {
    id: string;
    agentId: string | null;
    createdAt: Date;
  }

  it('keeps the newest review per agent from shuffled input', () => {
    const reviews: R[] = [
      { id: 'a-mid', agentId: 'agentA', createdAt: new Date('2026-06-02') },
      { id: 'a-newest', agentId: 'agentA', createdAt: new Date('2026-06-03') },
      { id: 'a-oldest', agentId: 'agentA', createdAt: new Date('2026-06-01') },
      { id: 'b-only', agentId: 'agentB', createdAt: new Date('2026-06-01') },
    ];
    const result = selectLatestReviewPerAgent(reviews);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['a-newest', 'b-only']);
  });

  it('treats agentId === null as one shared bucket', () => {
    const reviews: R[] = [
      { id: 'null-old', agentId: null, createdAt: new Date('2026-06-01') },
      { id: 'null-new', agentId: null, createdAt: new Date('2026-06-05') },
      { id: 'agent-x', agentId: 'x', createdAt: new Date('2026-06-01') },
    ];
    const result = selectLatestReviewPerAgent(reviews);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['agent-x', 'null-new']);
  });
});
