import { describe, expect, it, afterEach } from 'vitest';
import { connect } from './helpers/connect.js';
import { createFakeFetch, FIXTURE_AGENTS, FIXTURE_REPO, FIXTURE_PR, FIXTURE_REVIEW } from './helpers/fake-api.js';
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
const SECOND_AGENT = FIXTURE_AGENTS[1]!;
const RUNS_ROUTE = `GET /pulls/${FIXTURE_PR.id}/runs`;
const REVIEWS_ROUTE = `GET /pulls/${FIXTURE_PR.id}/reviews`;

const BASE_ROUTES = {
  'GET /agents': { status: 200, body: FIXTURE_AGENTS },
  'GET /repos': { status: 200, body: [FIXTURE_REPO] },
  [`GET /repos/${FIXTURE_REPO.id}/pulls`]: { status: 200, body: [FIXTURE_PR] },
};

const SUMMARY_REVIEW = {
  id: 'review-summary',
  run_id: null,
  agent_id: null,
  agent_name: null,
  kind: 'summary' as const,
  verdict: null,
  summary: 'Overall PR summary.',
  score: null,
  created_at: '2026-09-21T09:00:00.000Z', // newest by created_at
  findings: [],
};

const SECOND_AGENT_REVIEW = {
  ...FIXTURE_REVIEW,
  id: 'review-2',
  run_id: 'run-2',
  agent_id: SECOND_AGENT.id,
  agent_name: SECOND_AGENT.name,
  created_at: '2026-09-19T09:00:00.000Z', // older than FIXTURE_REVIEW
};

function deps(routes: Parameters<typeof createFakeFetch>[0]): ServerDeps {
  const { fetch } = createFakeFetch(routes);
  const api = createHttpApi(CONFIG, fetch);
  return { api, config: CONFIG, resolver: new Resolver(api) };
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

async function callGetFindings(args: Record<string, unknown>): Promise<CallToolResult> {
  return (await connected!.client.callTool({ name: 'get_findings', arguments: args })) as CallToolResult;
}

describe('get_findings', () => {
  it('by run_id: returns the done review', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [RUNS_ROUTE]: {
          status: 200,
          body: [{ run_id: FIXTURE_REVIEW.run_id, agent_id: AGENT.id, agent_name: AGENT.name, status: 'done', error: null, findings_count: 3 }],
        },
        [REVIEWS_ROUTE]: { status: 200, body: [FIXTURE_REVIEW] },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      run_id: FIXTURE_REVIEW.run_id,
    });
    expect(result.isError).toBeFalsy();
    expect(payloadOf<{ status: string }>(result).status).toBe('done');
  });

  it('by run_id: a still-running run returns a non-error "call again" result', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [RUNS_ROUTE]: {
          status: 200,
          body: [{ run_id: FIXTURE_REVIEW.run_id, agent_id: AGENT.id, agent_name: AGENT.name, status: 'running', error: null, findings_count: null }],
        },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      run_id: FIXTURE_REVIEW.run_id,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('call get_findings again');
    expect(payloadOf<{ status: string }>(result).status).toBe('running');
  });

  it('by run_id: a failed run is an error', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [RUNS_ROUTE]: {
          status: 200,
          body: [{ run_id: FIXTURE_REVIEW.run_id, agent_id: AGENT.id, agent_name: AGENT.name, status: 'failed', error: 'boom', findings_count: null }],
        },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      run_id: FIXTURE_REVIEW.run_id,
    });
    expect(result.isError).toBe(true);
  });

  it('a run_id from another PR is an error with the "omit run_id" hint', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [RUNS_ROUTE]: { status: 200, body: [] },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      run_id: '99999999-9999-4999-8999-999999999999',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Omit run_id');
  });

  it('no run_id: returns every agent\'s latest review, not the summary review', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [SUMMARY_REVIEW, FIXTURE_REVIEW, SECOND_AGENT_REVIEW] },
      }),
    );
    const result = await callGetFindings({ repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number });
    expect(result.isError).toBeFalsy();
    const payload = payloadOf<{ reviews: Array<{ run_id: string }>; total_findings: number }>(result);
    const runIds = payload.reviews.map((r) => r.run_id).sort();
    expect(runIds).toEqual([FIXTURE_REVIEW.run_id, SECOND_AGENT_REVIEW.run_id].sort());
    expect(payload.reviews).toHaveLength(2);
  });

  it('an older review from the same agent as a newer one is not double-counted (latest per agent only)', async () => {
    const olderSameAgent = { ...FIXTURE_REVIEW, id: 'review-older', created_at: '2020-01-01T00:00:00.000Z' };
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [olderSameAgent, FIXTURE_REVIEW] },
      }),
    );
    const result = await callGetFindings({ repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number });
    const payload = payloadOf<{ reviews: Array<{ run_id: string }> }>(result);
    expect(payload.reviews).toHaveLength(1);
    expect(payload.reviews[0]?.run_id).toBe(FIXTURE_REVIEW.run_id);
  });

  it('filters by agent — still a list shape, length <= 1', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [FIXTURE_REVIEW, SECOND_AGENT_REVIEW] },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      agent: SECOND_AGENT.id,
    });
    expect(result.isError).toBeFalsy();
    const payload = payloadOf<{ reviews: Array<{ run_id: string; agent: string }> }>(result);
    expect(payload.reviews).toHaveLength(1);
    expect(payload.reviews[0]?.run_id).toBe(SECOND_AGENT_REVIEW.run_id);
    expect(payload.reviews[0]?.agent).toBe(SECOND_AGENT.name);
  });

  it('no agent filter: reviews are sorted most-severe agent first (CRITICAL count desc), not alphabetically', async () => {
    // AGENT ('General Reviewer') sorts before SECOND_AGENT ('Security
    // Reviewer') alphabetically — strip AGENT's review down to zero
    // CRITICALs so the expected order below can only be explained by the
    // severity sort, not by agent name.
    const lowSeverityReview = {
      ...FIXTURE_REVIEW,
      findings: [FIXTURE_REVIEW.findings[1]!, FIXTURE_REVIEW.findings[2]!],
    };
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [lowSeverityReview, SECOND_AGENT_REVIEW] },
      }),
    );
    const result = await callGetFindings({ repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number });
    const payload = payloadOf<{ reviews: Array<{ agent: string }> }>(result);
    expect(payload.reviews.map((r) => r.agent)).toEqual([SECOND_AGENT.name, AGENT.name]);
  });

  it('min_severity filters findings in every review; total_findings counts after filtering', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [FIXTURE_REVIEW, SECOND_AGENT_REVIEW] },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      min_severity: 'CRITICAL',
    });
    const payload = payloadOf<{
      total_findings: number;
      reviews: Array<{ findings: unknown[]; findings_count: number }>;
    }>(result);
    expect(payload.total_findings).toBe(2); // one CRITICAL per agent
    for (const r of payload.reviews) {
      expect(r.findings).toHaveLength(1);
      expect(r.findings_count).toBe(1);
    }
  });

  it('max_findings caps findings across the whole payload and sets truncated', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [FIXTURE_REVIEW, SECOND_AGENT_REVIEW] },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      max_findings: 1,
    });
    const payload = payloadOf<{
      total_findings: number;
      truncated: boolean;
      reviews: Array<{ findings: unknown[]; findings_count: number }>;
    }>(result);
    const totalRendered = payload.reviews.reduce((sum, r) => sum + r.findings.length, 0);
    expect(totalRendered).toBe(1);
    expect(payload.truncated).toBe(true);
    // findings_count still reports the true per-review total, unaffected by max_findings.
    expect(payload.reviews.some((r) => r.findings_count === 3)).toBe(true);
    expect(textOf(result)).toContain('max_findings');
  });

  it('detailed response_format includes suggestion', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [FIXTURE_REVIEW] },
      }),
    );
    const result = await callGetFindings({
      repo: FIXTURE_REPO.full_name,
      pr: FIXTURE_PR.number,
      response_format: 'detailed',
    });
    const payload = payloadOf<{ reviews: Array<{ findings: Array<{ suggestion?: string }> }> }>(result);
    expect(payload.reviews[0]?.findings.some((f) => f.suggestion)).toBe(true);
  });

  it('no reviews at all is an error mentioning run_agent_on_pr', async () => {
    connected = await connect(
      deps({
        ...BASE_ROUTES,
        [REVIEWS_ROUTE]: { status: 200, body: [] },
      }),
    );
    const result = await callGetFindings({ repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('run_agent_on_pr');
  });
});
