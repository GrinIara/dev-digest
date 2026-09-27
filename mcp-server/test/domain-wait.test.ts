import { describe, expect, it, vi } from 'vitest';
import { waitForRun } from '../src/domain/wait.js';
import { ApiError } from '../src/domain/ports.js';
import type { DevDigestApi, RunLite } from '../src/domain/ports.js';

const PR_ID = 'pr-1';
const RUN_ID = 'run-1';

function runRow(status: string | null, extra: Partial<RunLite> = {}): RunLite {
  return {
    run_id: RUN_ID,
    agent_id: 'agent-1',
    agent_name: 'General Reviewer',
    status,
    error: null,
    findings_count: null,
    ...extra,
  };
}

/** A controllable fake clock: `now()` advances by `pollMs` (or the caller's
 * requested delay) every time `sleep()` is awaited, so the wait loop's
 * deadline math is exercised deterministically with zero real delay. */
function fakeClock(startMs = 0) {
  let current = startMs;
  const now = () => current;
  const sleep = vi.fn(async (ms: number) => {
    current += ms;
  });
  return { now, sleep };
}

describe('waitForRun', () => {
  it('returns done after polling twice', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce([runRow('running')])
      .mockResolvedValueOnce([runRow('done')]);
    const api = { listRuns } as unknown as DevDigestApi;

    const result = await waitForRun({
      api,
      prId: PR_ID,
      runId: RUN_ID,
      waitMs: 10_000,
      pollMs: 1_000,
      sleep,
      now,
    });

    expect(result.state).toBe('done');
    expect(listRuns).toHaveBeenCalledTimes(2);
  });

  it('returns failed with the run carrying the error text', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi.fn().mockResolvedValue([runRow('failed', { error: 'OPENROUTER_API_KEY missing' })]);
    const api = { listRuns } as unknown as DevDigestApi;

    const result = await waitForRun({ api, prId: PR_ID, runId: RUN_ID, waitMs: 10_000, pollMs: 1_000, sleep, now });
    expect(result.state).toBe('failed');
    expect(result.run?.error).toBe('OPENROUTER_API_KEY missing');
  });

  it('returns cancelled', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi.fn().mockResolvedValue([runRow('cancelled')]);
    const api = { listRuns } as unknown as DevDigestApi;

    const result = await waitForRun({ api, prId: PR_ID, runId: RUN_ID, waitMs: 10_000, pollMs: 1_000, sleep, now });
    expect(result.state).toBe('cancelled');
  });

  it('returns running once the deadline is reached, with the expected poll count', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi.fn().mockResolvedValue([runRow('running')]);
    const api = { listRuns } as unknown as DevDigestApi;

    const result = await waitForRun({ api, prId: PR_ID, runId: RUN_ID, waitMs: 5_000, pollMs: 1_000, sleep, now });
    expect(result.state).toBe('running');
    // 5000ms / 1000ms poll interval → 5 polls before the deadline is hit.
    expect(listRuns).toHaveBeenCalledTimes(5);
  });

  it('keeps polling through transient 429/5xx errors instead of failing the wait', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('http', 'rate limited', 429))
      .mockRejectedValueOnce(new ApiError('http', 'bad gateway', 502))
      .mockResolvedValueOnce([runRow('done')]);
    const api = { listRuns } as unknown as DevDigestApi;

    const result = await waitForRun({ api, prId: PR_ID, runId: RUN_ID, waitMs: 60_000, pollMs: 1_000, sleep, now });
    expect(result.state).toBe('done');
    expect(listRuns).toHaveBeenCalledTimes(3);
  });

  it('a non-transient ApiError propagates instead of being swallowed', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi.fn().mockRejectedValue(new ApiError('unreachable', 'API is down'));
    const api = { listRuns } as unknown as DevDigestApi;

    await expect(
      waitForRun({ api, prId: PR_ID, runId: RUN_ID, waitMs: 10_000, pollMs: 1_000, sleep, now }),
    ).rejects.toThrow('API is down');
  });

  it('a missing run row for up to 2 polls still counts as running, then throws', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi.fn().mockResolvedValue([]); // run never appears
    const api = { listRuns } as unknown as DevDigestApi;

    await expect(
      waitForRun({ api, prId: PR_ID, runId: RUN_ID, waitMs: 60_000, pollMs: 1_000, sleep, now }),
    ).rejects.toThrow(/disappeared/);
    // 2 tolerated misses + 1 that throws = 3 calls.
    expect(listRuns).toHaveBeenCalledTimes(3);
  });

  it('an aborted signal returns running immediately without further polling', async () => {
    const { now, sleep } = fakeClock();
    const controller = new AbortController();
    controller.abort();
    const listRuns = vi.fn().mockResolvedValue([runRow('running')]);
    const api = { listRuns } as unknown as DevDigestApi;

    const result = await waitForRun({
      api,
      prId: PR_ID,
      runId: RUN_ID,
      waitMs: 10_000,
      pollMs: 1_000,
      sleep,
      now,
      signal: controller.signal,
    });
    expect(result.state).toBe('running');
    expect(listRuns).not.toHaveBeenCalled();
  });

  it('emits onProgress after each poll when provided', async () => {
    const { now, sleep } = fakeClock();
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce([runRow('running')])
      .mockResolvedValueOnce([runRow('done')]);
    const api = { listRuns } as unknown as DevDigestApi;
    const onProgress = vi.fn();

    await waitForRun({ api, prId: PR_ID, runId: RUN_ID, waitMs: 10_000, pollMs: 1_000, sleep, now, onProgress });
    expect(onProgress).toHaveBeenCalled();
  });
});
