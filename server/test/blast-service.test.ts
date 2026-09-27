/**
 * Unit tests (no DB) for `BlastService.getBlast` — asserts the R3 "at most one
 * facade call, zero when not usable" property, the 404 for a missing pull,
 * and that the logger records `source: 'index' | 'skipped'`.
 *
 * Pattern: construct with a fake container ({ db, config, repoIntel }), then
 * patch the private `repo` the same way `test/repo-intel-facade-degraded.test.ts`
 * patches `RepoIntelService`'s private `repo`.
 */
import { describe, it, expect, vi } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { NotFoundError } from '../src/platform/errors.js';
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

function buildService(opts: {
  repoIntelEnabled: boolean;
  pullMissing?: boolean;
  files?: string[];
  defaultBranch?: string | null;
  indexState?: IndexState;
  getBlastRadius?: ReturnType<typeof vi.fn>;
  countIndexedFiles?: ReturnType<typeof vi.fn>;
}) {
  const getBlastRadius = opts.getBlastRadius ?? vi.fn().mockResolvedValue({
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
    degraded: false,
  });
  const getIndexState = vi.fn().mockResolvedValue(opts.indexState ?? baseIndexState());
  const countIndexedFiles = opts.countIndexedFiles ?? vi.fn().mockResolvedValue(0);
  const container = {
    db: {} as never,
    config: { repoIntelEnabled: opts.repoIntelEnabled },
    repoIntel: { getBlastRadius, getIndexState, countIndexedFiles } as never,
  } as never;
  const svc = new BlastService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getPullForWorkspace: async () =>
      opts.pullMissing
        ? undefined
        : {
            id: 'pr1',
            repoId: 'r1',
            headSha: 'deadbeef',
            defaultBranch: opts.defaultBranch === undefined ? 'main' : opts.defaultBranch,
          },
    getPrFilePaths: async () => opts.files ?? ['src/lib/rate.ts'],
  };
  return { svc, getBlastRadius, getIndexState, countIndexedFiles };
}

describe('BlastService.getBlast', () => {
  it('calls getBlastRadius exactly once when the index is full', async () => {
    const { svc, getBlastRadius } = buildService({
      repoIntelEnabled: true,
      indexState: baseIndexState({ status: 'full' }),
    });
    await svc.getBlast('ws1', 'pr1');
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('r1', ['src/lib/rate.ts']);
  });

  it('calls getBlastRadius exactly once when the index is partial', async () => {
    const { svc, getBlastRadius } = buildService({
      repoIntelEnabled: true,
      indexState: baseIndexState({ status: 'partial' }),
    });
    await svc.getBlast('ws1', 'pr1');
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
  });

  it('never calls getBlastRadius when the flag is off', async () => {
    const { svc, getBlastRadius, getIndexState } = buildService({ repoIntelEnabled: false });
    const response = await svc.getBlast('ws1', 'pr1');
    expect(getBlastRadius).not.toHaveBeenCalled();
    expect(getIndexState).not.toHaveBeenCalled();
    expect(response.degraded).toBe(true);
    expect(response.reason).toBe('flag_off');
  });

  it('never calls getBlastRadius when the index status is degraded', async () => {
    const { svc, getBlastRadius } = buildService({
      repoIntelEnabled: true,
      indexState: baseIndexState({ status: 'degraded', degraded: true, degradedReason: 'no_data' }),
    });
    await svc.getBlast('ws1', 'pr1');
    expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('never calls getBlastRadius when the index status is failed', async () => {
    const { svc, getBlastRadius } = buildService({
      repoIntelEnabled: true,
      indexState: baseIndexState({ status: 'failed' }),
    });
    await svc.getBlast('ws1', 'pr1');
    expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('never calls getBlastRadius when there are no PR files', async () => {
    const { svc, getBlastRadius } = buildService({
      repoIntelEnabled: true,
      files: [],
      indexState: baseIndexState({ status: 'full' }),
    });
    const response = await svc.getBlast('ws1', 'pr1');
    expect(getBlastRadius).not.toHaveBeenCalled();
    expect(response.degraded).toBe(true);
    expect(response.reason).toBe('no_data');
  });

  it('calls countIndexedFiles exactly once, with the same gate as getBlastRadius, and threads the count into files.indexed', async () => {
    const countIndexedFiles = vi.fn().mockResolvedValue(0);
    const { svc } = buildService({
      repoIntelEnabled: true,
      indexState: baseIndexState({ status: 'full' }),
      countIndexedFiles,
    });
    const response = await svc.getBlast('ws1', 'pr1');
    expect(countIndexedFiles).toHaveBeenCalledTimes(1);
    expect(countIndexedFiles).toHaveBeenCalledWith('r1', ['src/lib/rate.ts']);
    expect(response.files).toEqual({ changed: 1, indexed: 0 });
  });

  it('counts coverage over source files only — docs/config never read as "missing from the index"', async () => {
    const countIndexedFiles = vi.fn().mockResolvedValue(1);
    const { svc } = buildService({
      repoIntelEnabled: true,
      indexState: baseIndexState({ status: 'full' }),
      files: ['src/lib/rate.ts', 'README.md', 'package.json', 'scripts/dev.sh'],
      countIndexedFiles,
    });
    const response = await svc.getBlast('ws1', 'pr1');
    expect(countIndexedFiles).toHaveBeenCalledWith('r1', ['src/lib/rate.ts']);
    expect(response.files).toEqual({ changed: 1, indexed: 1 });
  });

  it('never calls countIndexedFiles when the index is not usable (flag off)', async () => {
    const countIndexedFiles = vi.fn().mockResolvedValue(5);
    const { svc } = buildService({ repoIntelEnabled: false, countIndexedFiles });
    const response = await svc.getBlast('ws1', 'pr1');
    expect(countIndexedFiles).not.toHaveBeenCalled();
    expect(response.files).toEqual({ changed: 1, indexed: 0 });
  });

  it("sets indexed_branch from the repo's default branch", async () => {
    const { svc } = buildService({
      repoIntelEnabled: true,
      defaultBranch: 'develop',
      indexState: baseIndexState({ status: 'full' }),
    });
    const response = await svc.getBlast('ws1', 'pr1');
    expect(response.indexed_branch).toBe('develop');
  });

  it('indexed_branch is null when the repo has no known default branch', async () => {
    const { svc } = buildService({
      repoIntelEnabled: true,
      defaultBranch: null,
      indexState: baseIndexState({ status: 'full' }),
    });
    const response = await svc.getBlast('ws1', 'pr1');
    expect(response.indexed_branch).toBeNull();
  });

  it('throws NotFoundError for a missing pull', async () => {
    const { svc } = buildService({ repoIntelEnabled: true, pullMissing: true });
    await expect(svc.getBlast('ws1', 'unknown')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('logs source: "index" when the facade is called', async () => {
    const { svc } = buildService({ repoIntelEnabled: true, indexState: baseIndexState({ status: 'full' }) });
    const info = vi.fn();
    await svc.getBlast('ws1', 'pr1', { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() });
    expect(info).toHaveBeenCalledTimes(1);
    const [payload] = info.mock.calls[0]!;
    expect((payload as { source: string }).source).toBe('index');
  });

  it('logs source: "skipped" when the flag is off', async () => {
    const { svc } = buildService({ repoIntelEnabled: false });
    const info = vi.fn();
    await svc.getBlast('ws1', 'pr1', { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() });
    expect(info).toHaveBeenCalledTimes(1);
    const [payload] = info.mock.calls[0]!;
    expect((payload as { source: string }).source).toBe('skipped');
  });
});
