import { describe, it, expect } from 'vitest';
import {
  groupDownstream,
  indexableFiles,
  countBlast,
  buildSummary,
  resolveDegraded,
  toBlastRadiusResponse,
} from '../src/modules/blast/helpers.js';
import { MAX_CALLERS_PER_SYMBOL, BFS_DEPTH } from '../src/modules/repo-intel/constants.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

function baseIndexState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 100,
    lastIndexedSha: 'abc123',
    indexerVersion: 2,
    updatedAt: new Date('2026-09-27T00:00:00Z'),
    ...overrides,
  };
}

describe('blast/helpers — groupDownstream', () => {
  it('groups six flat callers across two viaSymbols, dedupes/sorts endpoints+crons, orders endpoint-reaching groups first', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' },
        { file: 'src/lib/rate.ts', name: 'resetBuckets', kind: 'function' },
      ],
      callers: [
        { file: 'src/api/public/index.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 80 },
        { file: 'src/api/webhooks.ts', symbol: 'webhookHandler', viaSymbol: 'rateLimit', line: 10, rank: 50 },
        { file: 'src/api/public/index.ts', symbol: 'otherHandler', viaSymbol: 'rateLimit', line: 5, rank: 80 },
        { file: 'src/jobs/reset.ts', symbol: 'resetJob', viaSymbol: 'resetBuckets', line: 15, rank: 60 },
        { file: 'src/jobs/reset.ts', symbol: 'resetJobOther', viaSymbol: 'resetBuckets', line: 5, rank: 60 },
        { file: 'src/api/admin/index.ts', symbol: 'adminRouter', viaSymbol: 'resetBuckets', line: 8, rank: 90 },
      ],
      impactedEndpoints: [],
      factsByFile: {
        'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
        'src/api/webhooks.ts': { endpoints: ['POST /api/webhooks'], crons: [] },
        'src/jobs/reset.ts': { endpoints: [], crons: ['job:reset-rate-buckets'] },
      },
      degraded: false,
    };

    const downstream = groupDownstream(result);

    // rateLimit reaches endpoints, resetBuckets only a cron — endpoints win
    // over resetBuckets' higher max rank (90 vs 80).
    expect(downstream.map((d) => d.symbol)).toEqual(['rateLimit', 'resetBuckets']);

    const resetGroup = downstream[1]!;
    // rank desc, then file asc, then line asc: admin/index.ts (90) first,
    // then jobs/reset.ts's two callers ordered by line (5 before 15).
    expect(resetGroup.callers).toEqual([
      { name: 'adminRouter', file: 'src/api/admin/index.ts', line: 8 },
      { name: 'resetJobOther', file: 'src/jobs/reset.ts', line: 5 },
      { name: 'resetJob', file: 'src/jobs/reset.ts', line: 15 },
    ]);
    // admin/index.ts has no facts entry; jobs/reset.ts has crons only.
    expect(resetGroup.endpoints_affected).toEqual([]);
    expect(resetGroup.crons_affected).toEqual(['job:reset-rate-buckets']);

    const rateGroup = downstream[0]!;
    // Both public/index.ts callers share rank 80: tie-broken by file (equal),
    // then line asc (5 before 23); webhookHandler (rank 50) comes last.
    expect(rateGroup.callers).toEqual([
      { name: 'otherHandler', file: 'src/api/public/index.ts', line: 5 },
      { name: 'publicRouter', file: 'src/api/public/index.ts', line: 23 },
      { name: 'webhookHandler', file: 'src/api/webhooks.ts', line: 10 },
    ]);
    expect(rateGroup.endpoints_affected).toEqual(['GET /api/public/items', 'POST /api/webhooks']);
    expect(rateGroup.crons_affected).toEqual([]);
  });

  it('missing factsByFile yields empty endpoints and crons', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/public/index.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 80 },
      ],
      impactedEndpoints: [],
      degraded: false,
      // factsByFile intentionally omitted.
    };
    const downstream = groupDownstream(result);
    expect(downstream[0]!.endpoints_affected).toEqual([]);
    expect(downstream[0]!.crons_affected).toEqual([]);
  });

  it('puts symbols that reach an endpoint before higher-ranked symbols that reach none', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/lib/a.ts', name: 'noEndpoint', kind: 'function' },
        { file: 'src/lib/a.ts', name: 'withEndpoint', kind: 'function' },
      ],
      callers: [
        { file: 'src/ui/widget.ts', symbol: 'Widget', viaSymbol: 'noEndpoint', line: 3, rank: 99 },
        { file: 'src/api/items.ts', symbol: 'itemsRoute', viaSymbol: 'withEndpoint', line: 7, rank: 10 },
      ],
      impactedEndpoints: [],
      factsByFile: { 'src/api/items.ts': { endpoints: ['GET /items'], crons: [] } },
      degraded: false,
    };
    expect(groupDownstream(result).map((d) => d.symbol)).toEqual(['withEndpoint', 'noEndpoint']);
  });
});

describe('blast/helpers — countBlast', () => {
  it('counts every declared symbol (not just those with callers), sums callers, dedupes endpoints/crons', () => {
    const counts = countBlast(
      [
        {
          symbol: 'rateLimit',
          callers: [
            { name: 'a', file: 'a.ts', line: 1 },
            { name: 'b', file: 'b.ts', line: 2 },
          ],
          endpoints_affected: ['GET /x'],
          crons_affected: [],
        },
        {
          symbol: 'resetBuckets',
          callers: [{ name: 'c', file: 'c.ts', line: 3 }],
          endpoints_affected: ['GET /x', 'POST /y'],
          crons_affected: ['job:z'],
        },
      ],
      [
        { file: 'a.ts', name: 'rateLimit', kind: 'function' },
        { file: 'a.ts', name: 'resetBuckets', kind: 'function' },
        { file: 'a.ts', name: 'unused', kind: 'function' }, // no callers, still counted
      ],
    );
    expect(counts).toEqual({ symbols: 3, callers: 3, endpoints: 2, crons: 1 });
  });
});

describe('blast/helpers — buildSummary', () => {
  it('0 callers', () => {
    expect(
      buildSummary({ symbols: 2, callers: 0, endpoints: 0, crons: 0 }, false, null, { changed: 1, indexed: 1 }, null),
    ).toBe('2 changed symbol(s), no downstream callers found.');
  });

  it('N callers', () => {
    expect(
      buildSummary({ symbols: 1, callers: 5, endpoints: 3, crons: 1 }, false, null, { changed: 1, indexed: 1 }, null),
    ).toBe('1 changed symbol(s) reach 5 caller(s); 3 endpoint(s) and 1 cron(s) may be affected.');
  });

  it('appends the degraded suffix', () => {
    expect(
      buildSummary(
        { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
        true,
        'index_partial',
        { changed: 1, indexed: 1 },
        null,
      ),
    ).toBe('1 changed symbol(s), no downstream callers found. Index incomplete (index_partial).');
  });

  it('none of the changed files are indexed, branch unknown — falls back to "the repo index" (PR #218 bug)', () => {
    expect(
      buildSummary({ symbols: 3, callers: 0, endpoints: 0, crons: 0 }, false, null, { changed: 48, indexed: 0 }, null),
    ).toBe(
      '3 changed symbol(s): none of the 48 changed file(s) are in the repo index yet (new files, or the index is older than this PR).',
    );
  });

  it('none of the changed files are indexed, branch known — names the branch the index is built from', () => {
    expect(
      buildSummary(
        { symbols: 3, callers: 0, endpoints: 0, crons: 0 },
        false,
        null,
        { changed: 48, indexed: 0 },
        'main',
      ),
    ).toBe(
      "3 changed symbol(s): none of the 48 changed file(s) are in the index built from main yet (new files, or the index is older than this PR).",
    );
  });

  it('some (not all) changed files are indexed, branch unknown — appends the "N of M" note without a branch', () => {
    expect(
      buildSummary(
        { symbols: 1, callers: 5, endpoints: 3, crons: 1 },
        false,
        null,
        { changed: 10, indexed: 4 },
        null,
      ),
    ).toBe(
      "1 changed symbol(s) reach 5 caller(s); 3 endpoint(s) and 1 cron(s) may be affected. 6 of 10 changed files aren't in the index yet.",
    );
  });

  it('some (not all) changed files are indexed, branch known — the "N of M" note names the branch', () => {
    expect(
      buildSummary(
        { symbols: 1, callers: 5, endpoints: 3, crons: 1 },
        false,
        null,
        { changed: 10, indexed: 4 },
        'main',
      ),
    ).toBe(
      "1 changed symbol(s) reach 5 caller(s); 3 endpoint(s) and 1 cron(s) may be affected. 6 of 10 changed files aren't in the index built from main yet.",
    );
  });

  it('all changed files indexed — no coverage note even when the branch is known', () => {
    expect(
      buildSummary(
        { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
        false,
        null,
        { changed: 3, indexed: 3 },
        'main',
      ),
    ).toBe('1 changed symbol(s), no downstream callers found.');
  });
});

describe('blast/helpers — resolveDegraded', () => {
  it('flag off', () => {
    expect(resolveDegraded({ flagOn: false, state: null, filesCount: 1, result: null })).toEqual({
      degraded: true,
      reason: 'flag_off',
    });
  });

  it('no state', () => {
    expect(resolveDegraded({ flagOn: true, state: null, filesCount: 1, result: null })).toEqual({
      degraded: true,
      reason: 'no_data',
    });
  });

  it('status failed, no explicit degradedReason', () => {
    const state = baseIndexState({ status: 'failed', degraded: true });
    expect(resolveDegraded({ flagOn: true, state, filesCount: 1, result: null })).toEqual({
      degraded: true,
      reason: 'index_failed',
    });
  });

  it('status degraded with an explicit degradedReason', () => {
    const state = baseIndexState({ status: 'degraded', degraded: true, degradedReason: 'repo_too_large' });
    expect(resolveDegraded({ flagOn: true, state, filesCount: 1, result: null })).toEqual({
      degraded: true,
      reason: 'repo_too_large',
    });
  });

  it('no files', () => {
    const state = baseIndexState({ status: 'full' });
    expect(resolveDegraded({ flagOn: true, state, filesCount: 0, result: null })).toEqual({
      degraded: true,
      reason: 'no_data',
    });
  });

  it('result itself degraded', () => {
    const state = baseIndexState({ status: 'full' });
    const result: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'repo_too_large',
    };
    expect(resolveDegraded({ flagOn: true, state, filesCount: 1, result })).toEqual({
      degraded: true,
      reason: 'repo_too_large',
    });
  });

  it('partial index', () => {
    const state = baseIndexState({ status: 'partial' });
    const result: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
    expect(resolveDegraded({ flagOn: true, state, filesCount: 1, result })).toEqual({
      degraded: true,
      reason: 'index_partial',
    });
  });

  it('healthy', () => {
    const state = baseIndexState({ status: 'full' });
    const result: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
    expect(resolveDegraded({ flagOn: true, state, filesCount: 1, result })).toEqual({
      degraded: false,
      reason: null,
    });
  });
});

describe('blast/helpers — toBlastRadiusResponse', () => {
  it('callers_truncated is true at exactly MAX_CALLERS_PER_SYMBOL callers, and limits match repo-intel constants', () => {
    const callers = Array.from({ length: MAX_CALLERS_PER_SYMBOL }, (_, i) => ({
      file: `src/caller${i}.ts`,
      symbol: `caller${i}`,
      viaSymbol: 'rateLimit',
      line: i + 1,
      rank: 1,
    }));
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' }],
      callers,
      impactedEndpoints: [],
      degraded: false,
    };
    const state = baseIndexState({ status: 'full' });
    const response = toBlastRadiusResponse(
      'pr1',
      result,
      { degraded: false, reason: null },
      state,
      { changed: 1, indexed: 1 },
      'main',
    );
    expect(response.callers_truncated).toBe(true);
    expect(response.limits).toEqual({ max_callers_per_symbol: MAX_CALLERS_PER_SYMBOL, bfs_depth: BFS_DEPTH });
  });

  it('callers_truncated is false one below the cap', () => {
    const callers = Array.from({ length: MAX_CALLERS_PER_SYMBOL - 1 }, (_, i) => ({
      file: `src/caller${i}.ts`,
      symbol: `caller${i}`,
      viaSymbol: 'rateLimit',
      line: i + 1,
      rank: 1,
    }));
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' }],
      callers,
      impactedEndpoints: [],
      degraded: false,
    };
    const state = baseIndexState({ status: 'full' });
    const response = toBlastRadiusResponse(
      'pr1',
      result,
      { degraded: false, reason: null },
      state,
      { changed: 1, indexed: 1 },
      'main',
    );
    expect(response.callers_truncated).toBe(false);
  });

  it('a null result (index not usable) produces an empty, degraded response with indexed_sha from state', () => {
    const state = baseIndexState({ status: 'degraded', lastIndexedSha: '', degraded: true, degradedReason: 'no_data' });
    const response = toBlastRadiusResponse(
      'pr1',
      null,
      { degraded: true, reason: 'no_data' },
      state,
      { changed: 0, indexed: 0 },
      null,
    );
    expect(response.downstream).toEqual([]);
    expect(response.changed_symbols).toEqual([]);
    expect(response.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(response.degraded).toBe(true);
    expect(response.reason).toBe('no_data');
    expect(response.indexed_sha).toBeNull();
    expect(response.indexed_branch).toBeNull();
    expect(response.callers_truncated).toBe(false);
  });

  it('sets indexed_branch from the repo default branch, and files from the caller-supplied counts', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };
    const state = baseIndexState({ status: 'full' });
    const response = toBlastRadiusResponse(
      'pr1',
      result,
      { degraded: false, reason: null },
      state,
      { changed: 3, indexed: 1 },
      'develop',
    );
    expect(response.indexed_branch).toBe('develop');
    expect(response.files).toEqual({ changed: 3, indexed: 1 });
  });

  it('restricts facts_by_file to caller files present in downstream', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/public/index.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 80 },
      ],
      impactedEndpoints: [],
      factsByFile: {
        'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
        'src/unrelated.ts': { endpoints: ['GET /unrelated'], crons: [] },
      },
      degraded: false,
    };
    const state = baseIndexState({ status: 'full' });
    const response = toBlastRadiusResponse(
      'pr1',
      result,
      { degraded: false, reason: null },
      state,
      { changed: 1, indexed: 1 },
      'main',
    );
    expect(Object.keys(response.facts_by_file)).toEqual(['src/api/public/index.ts']);
  });
});

describe('blast/helpers — indexableFiles', () => {
  it('keeps only files the repo-intel walker parses (SUPPORTED_EXT, not under EXCLUDED_DIRS)', () => {
    expect(
      indexableFiles([
        'server/src/a.ts',
        'client/src/B.tsx',
        'scripts/x.mjs',
        'README.md',
        'package.json',
        'scripts/dev.sh',
        'server/src/db/migrations/0001.sql',
        'client/src/vendor/shared/c.ts',
        'node_modules/pkg/index.js',
        'Makefile',
      ]),
    ).toEqual(['server/src/a.ts', 'client/src/B.tsx', 'scripts/x.mjs']);
  });
});
