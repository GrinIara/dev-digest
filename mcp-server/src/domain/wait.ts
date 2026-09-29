import type { DevDigestApi, RunLite } from './ports.js';
import { ApiError } from './ports.js';
import { ToolError } from './tool-result.js';

export type WaitState = 'done' | 'failed' | 'cancelled' | 'running';

export interface WaitForRunResult {
  state: WaitState;
  run?: RunLite;
}

export interface WaitForRunOptions {
  api: DevDigestApi;
  prId: string;
  runId: string;
  waitMs: number;
  pollMs: number;
  /** Injected for hermetic, zero-delay tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for deterministic deadline math in tests. */
  now?: () => number;
  signal?: AbortSignal;
  onProgress?: (elapsedMs: number, totalMs: number) => void;
}

const MAX_BACKOFF_MS = 10_000;
/** A missing run row (read-after-write lag, or a boot-time reaper racing the
 * poll) counts as still-running for this many consecutive polls before it
 * becomes a hard error (§6a Risk mitigation: bounded, not an infinite loop). */
const MAX_MISSING_POLLS = 2;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown): err is ApiError {
  if (!(err instanceof ApiError)) return false;
  if (err.kind === 'timeout') return true;
  if (err.kind === 'http' && err.status !== undefined) {
    return err.status === 429 || err.status >= 500;
  }
  return false;
}

/**
 * Polls `GET /pulls/:prId/runs` (never `/runs/:id/trace` — see plan §0.3: a
 * boot reaper or orphan-cancel can set a terminal status without ever writing
 * a trace) until `runId` reaches a terminal status or `waitMs` elapses.
 * Transient failures (429/5xx/timeout) back off exponentially, capped at
 * `MAX_BACKOFF_MS`, and keep polling until the deadline rather than failing
 * the whole wait.
 */
export async function waitForRun(opts: WaitForRunOptions): Promise<WaitForRunResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const start = now();
  const deadline = start + opts.waitMs;

  let backoff = opts.pollMs;
  let missingPolls = 0;
  let lastRun: RunLite | undefined;

  for (;;) {
    if (opts.signal?.aborted) {
      return { state: 'running', run: lastRun };
    }
    if (now() >= deadline) {
      return { state: 'running', run: lastRun };
    }

    let runs: RunLite[];
    try {
      runs = await opts.api.listRuns(opts.prId);
    } catch (err) {
      if (isTransient(err)) {
        if (now() >= deadline) return { state: 'running', run: lastRun };
        await sleep(Math.max(0, Math.min(backoff, deadline - now())));
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        continue;
      }
      throw err;
    }
    backoff = opts.pollMs; // reset backoff after a successful poll

    const run = runs.find((r) => r.run_id === opts.runId);
    if (!run) {
      missingPolls += 1;
      if (missingPolls > MAX_MISSING_POLLS) {
        throw new ToolError(
          `Run ${opts.runId} disappeared from ${opts.prId}'s run history. Call run_agent_on_pr again.`,
        );
      }
    } else {
      missingPolls = 0;
      lastRun = run;
      if (run.status === 'done') return { state: 'done', run };
      if (run.status === 'failed') return { state: 'failed', run };
      if (run.status === 'cancelled') return { state: 'cancelled', run };
      // 'running', null, or an unrecognized status — keep polling.
    }

    opts.onProgress?.(now() - start, opts.waitMs);

    if (now() >= deadline) {
      return { state: 'running', run: lastRun };
    }
    await sleep(Math.max(0, Math.min(opts.pollMs, deadline - now())));
  }
}
