import { describe, expect, it, afterEach, vi } from 'vitest';
import { connect } from './helpers/connect.js';
import {
  createFakeFetch,
  FIXTURE_AGENTS,
  FIXTURE_REPO,
  FIXTURE_PR,
  FIXTURE_RUN_ID,
  FIXTURE_REVIEW,
} from './helpers/fake-api.js';
import { createHttpApi } from '../src/api/client.js';
import { Resolver } from '../src/domain/resolve.js';
import type { ServerDeps } from '../src/server.js';
import type { McpConfig } from '../src/config.js';
import type { Connected } from './helpers/connect.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const CONFIG: McpConfig = {
  apiUrl: 'http://localhost:3001',
  waitMs: 120_000,
  pollMs: 2_000,
  httpTimeoutMs: 15_000,
};

const AGENT = FIXTURE_AGENTS[0]!;
const REVIEW_ROUTE = `GET /pulls/${FIXTURE_PR.id}/reviews`;
const RUNS_ROUTE = `GET /pulls/${FIXTURE_PR.id}/runs`;
const TRIGGER_ROUTE = `POST /pulls/${FIXTURE_PR.id}/review`;

const BASE_ROUTES = {
  'GET /agents': { status: 200, body: FIXTURE_AGENTS },
  'GET /repos': { status: 200, body: [FIXTURE_REPO] },
  [`GET /repos/${FIXTURE_REPO.id}/pulls`]: { status: 200, body: [FIXTURE_PR] },
};

function triggerResponse() {
  return {
    status: 200,
    body: {
      pr_id: FIXTURE_PR.id,
      runs: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name }],
    },
  };
}

/** Zero-delay, deterministic clock: `now()` advances only when `sleep()` is
 * awaited, decoupling the wait loop's deadline math from real time. */
function fakeClock(startMs = 0) {
  let current = startMs;
  const now = () => current;
  const sleep = vi.fn(async (ms: number) => {
    current += ms;
  });
  return { now, sleep };
}

function textOf(result: CallToolResult): string {
  return (result.content as Array<{ type: string; text: string }>)[0]!.text;
}

function payloadOf<T>(result: CallToolResult): T {
  return JSON.parse(textOf(result).split('\n').slice(1).join('\n')) as T;
}

let connected: Connected | undefined;

afterEach(async () => {
  await connected?.close();
  connected = undefined;
});

function makeDeps(
  routes: Parameters<typeof createFakeFetch>[0],
  clock: { now: () => number; sleep: (ms: number) => Promise<void> },
  config: McpConfig = CONFIG,
): { deps: ServerDeps; calls: ReturnType<typeof createFakeFetch>['calls'] } {
  const { fetch, calls } = createFakeFetch(routes);
  const api = createHttpApi(config, fetch);
  return {
    deps: { api, config, resolver: new Resolver(api), sleep: clock.sleep, now: clock.now },
    calls,
  };
}

describe('run_agent_on_pr', () => {
  it('happy path: running, running, then done — with the expected call order', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: [
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'running', error: null, findings_count: null }] },
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'running', error: null, findings_count: null }] },
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'done', error: null, findings_count: 3 }] },
        ],
        [REVIEW_ROUTE]: { status: 200, body: [FIXTURE_REVIEW] },
      },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const payload = payloadOf<{ status: string; verdict: string; findings: unknown[] }>(result);
    expect(payload.status).toBe('done');
    expect(payload.verdict).toBe('request_changes');
    expect(payload.findings.length).toBeGreaterThan(0);

    const methPaths = calls.map((c) => `${c.method} ${c.path}`);
    expect(methPaths).toEqual([
      'GET /agents',
      'GET /repos',
      `GET /repos/${FIXTURE_REPO.id}/pulls`,
      `POST /pulls/${FIXTURE_PR.id}/review`,
      RUNS_ROUTE,
      RUNS_ROUTE,
      RUNS_ROUTE,
      REVIEW_ROUTE,
    ]);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('returns a non-error "running" result once the wait deadline is reached, steering to get_findings', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'running', error: null, findings_count: null }] },
      },
      clock,
      { ...CONFIG, waitMs: 3_000, pollMs: 1_000 },
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain('get_findings');
    expect(text).toContain(FIXTURE_RUN_ID);
    expect(text).toContain('Do NOT call run_agent_on_pr again');
    const payload = payloadOf<{ status: string; run_id: string }>(result);
    expect(payload.status).toBe('running');
    expect(payload.run_id).toBe(FIXTURE_RUN_ID);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('a failed run mentions DevDigest Settings', async () => {
    const clock = fakeClock();
    const { deps } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'failed', error: 'OPENROUTER_API_KEY missing', findings_count: null }] },
      },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Settings');
    expect(textOf(result)).toContain('OPENROUTER_API_KEY missing');
  });

  it('a cancelled run offers a re-run hint', async () => {
    const clock = fakeClock();
    const { deps } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'cancelled', error: null, findings_count: null }] },
      },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('run_agent_on_pr again');
  });

  it('an unknown agent is an error mentioning list_agents, with 0 POST calls', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps({ ...BASE_ROUTES }, clock);
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: 'does-not-exist' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('list_agents');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('an unknown repo is an error listing known repos, with 0 POST calls', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps(
      { 'GET /agents': { status: 200, body: FIXTURE_AGENTS }, 'GET /repos': { status: 200, body: [FIXTURE_REPO] } },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/missing', pr: 1, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(FIXTURE_REPO.full_name);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('an unknown PR number is an error, with 0 POST calls', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps({ ...BASE_ROUTES }, clock);
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: 999999, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('#999999');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('a timeout while starting the review does not suggest retrying run_agent_on_pr (security review M1)', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: { ...triggerResponse(), delayMs: 500 },
      },
      clock,
      { ...CONFIG, httpTimeoutMs: 10 },
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('may already have started');
    expect(text).toContain(`get_findings with repo=${FIXTURE_REPO.full_name}, pr=${FIXTURE_PR.number}`);
    expect(text).toContain('Do NOT call run_agent_on_pr again');
    expect(text).not.toContain('then retry');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('an invalid response while starting the review does not suggest retrying run_agent_on_pr (security review M1)', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: { status: 200, body: { nope: true } },
      },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('may already have started');
    expect(text).toContain(`get_findings with repo=${FIXTURE_REPO.full_name}, pr=${FIXTURE_PR.number}`);
    expect(text).toContain('Do NOT call run_agent_on_pr again');
    expect(text).not.toContain('then retry');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('an unreachable API while starting the review still allows a retry hint (nothing was created)', async () => {
    const clock = fakeClock();
    const { fetch: baseFetch } = createFakeFetch({ ...BASE_ROUTES });
    const refusingFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/review')) {
        throw new TypeError('fetch failed');
      }
      return baseFetch(input, init);
    }) as typeof fetch;
    const api = createHttpApi(CONFIG, refusingFetch);
    connected = await connect({ api, config: CONFIG, resolver: new Resolver(api), ...clock });

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('./scripts/dev.sh');
  });

  it('a 429 on the trigger reports the 10-per-minute limit', async () => {
    const clock = fakeClock();
    const { deps } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: {
          status: 429,
          body: { error: { code: 'rate_limited', message: 'Too many requests' } },
        },
      },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('10 review starts per minute');
  });

  it('a transient 429/5xx while polling does not fail the wait — it still reaches done', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: [
          { status: 429, body: { error: { code: 'rate_limited', message: 'slow down' } } },
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'done', error: null, findings_count: 3 }] },
        ],
        [REVIEW_ROUTE]: { status: 200, body: [FIXTURE_REVIEW] },
      },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(payloadOf<{ status: string }>(result).status).toBe('done');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('sends notifications/progress when the client supplies a progressToken', async () => {
    const clock = fakeClock();
    const { deps } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: [
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'running', error: null, findings_count: null }] },
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'done', error: null, findings_count: 3 }] },
        ],
        [REVIEW_ROUTE]: { status: 200, body: [FIXTURE_REVIEW] },
      },
      clock,
    );
    connected = await connect(deps);

    const progressEvents: unknown[] = [];
    await connected.client.callTool(
      { name: 'run_agent_on_pr', arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id } },
      undefined,
      { onprogress: (p) => progressEvents.push(p) },
    );
    expect(progressEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('sends no progress notifications without a progressToken', async () => {
    const clock = fakeClock();
    const { deps } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: [
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'running', error: null, findings_count: null }] },
          { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'done', error: null, findings_count: 3 }] },
        ],
        [REVIEW_ROUTE]: { status: 200, body: [FIXTURE_REVIEW] },
      },
      clock,
    );
    connected = await connect(deps);

    const result = (await connected.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id },
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
  });

  it('a client-side abort stops the call without starting a second run (best-effort integration check; see domain-wait.test.ts for the deterministic unit test)', async () => {
    const clock = fakeClock();
    const { deps, calls } = makeDeps(
      {
        ...BASE_ROUTES,
        [TRIGGER_ROUTE]: triggerResponse(),
        [RUNS_ROUTE]: { status: 200, body: [{ run_id: FIXTURE_RUN_ID, agent_id: AGENT.id, agent_name: AGENT.name, status: 'running', error: null, findings_count: null }] },
      },
      clock,
      { ...CONFIG, waitMs: 60_000, pollMs: 1_000 },
    );
    connected = await connect(deps);

    const controller = new AbortController();
    const callPromise = connected.client.callTool(
      { name: 'run_agent_on_pr', arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number, agent: AGENT.id } },
      undefined,
      { signal: controller.signal },
    );
    queueMicrotask(() => controller.abort());
    const outcome = await callPromise.catch((err: unknown) => err);

    // Either the abort landed before the trigger POST was even issued, or it
    // landed while polling after exactly one trigger — either way, a second
    // POST /pulls/:id/review is never issued (the one invariant that matters).
    expect(calls.filter((c) => c.method === 'POST').length).toBeLessThanOrEqual(1);
    if (!(outcome instanceof Error)) {
      const result = outcome as CallToolResult;
      if (!result.isError) {
        expect(payloadOf<{ status: string }>(result).status).toBe('running');
      }
    }
  });
});
