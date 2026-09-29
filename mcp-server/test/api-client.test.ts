import { describe, expect, it } from 'vitest';
import { createHttpApi } from '../src/api/client.js';
import { ApiError } from '../src/domain/ports.js';
import { registerSecret } from '../src/log.js';
import type { McpConfig } from '../src/config.js';
import {
  createFakeFetch,
  FIXTURE_AGENTS,
  FIXTURE_REPO,
  FIXTURE_PR,
  FIXTURE_RUN_DONE,
  FIXTURE_REVIEW,
  FIXTURE_CONVENTIONS,
  FIXTURE_BLAST,
} from './helpers/fake-api.js';

const BASE_CONFIG: McpConfig = {
  apiUrl: 'http://localhost:3001',
  waitMs: 120_000,
  pollMs: 2_000,
  httpTimeoutMs: 200,
};

describe('createHttpApi — happy paths', () => {
  it('listAgents parses the seeded agents', async () => {
    const { fetch } = createFakeFetch({
      'GET /agents': { status: 200, body: FIXTURE_AGENTS },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const agents = await api.listAgents();
    expect(agents).toHaveLength(4);
    expect(agents[0]?.name).toBe('General Reviewer');
  });

  it('listRepos parses the seeded repo', async () => {
    const { fetch } = createFakeFetch({ 'GET /repos': { status: 200, body: [FIXTURE_REPO] } });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const repos = await api.listRepos();
    expect(repos).toEqual([FIXTURE_REPO]);
  });

  it('listPulls parses the seeded PR', async () => {
    const { fetch } = createFakeFetch({
      [`GET /repos/${FIXTURE_REPO.id}/pulls`]: { status: 200, body: [FIXTURE_PR] },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const pulls = await api.listPulls(FIXTURE_REPO.id);
    expect(pulls).toEqual([FIXTURE_PR]);
  });

  it('startReview posts {agentId} and parses the trigger response', async () => {
    const agentId = FIXTURE_AGENTS[0]!.id;
    const { fetch, calls } = createFakeFetch({
      [`POST /pulls/${FIXTURE_PR.id}/review`]: {
        status: 200,
        body: { pr_id: FIXTURE_PR.id, runs: [{ run_id: FIXTURE_RUN_DONE.run_id, agent_id: agentId, agent_name: 'General Reviewer' }] },
      },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const result = await api.startReview(FIXTURE_PR.id, agentId);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.run_id).toBe(FIXTURE_RUN_DONE.run_id);
    expect(calls[0]?.body).toEqual({ agentId });
  });

  it('listRuns parses a run summary', async () => {
    const { fetch } = createFakeFetch({
      [`GET /pulls/${FIXTURE_PR.id}/runs`]: { status: 200, body: [FIXTURE_RUN_DONE] },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const runs = await api.listRuns(FIXTURE_PR.id);
    expect(runs).toEqual([FIXTURE_RUN_DONE]);
  });

  it('listReviews parses a review with findings', async () => {
    const { fetch } = createFakeFetch({
      [`GET /pulls/${FIXTURE_PR.id}/reviews`]: { status: 200, body: [FIXTURE_REVIEW] },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const reviews = await api.listReviews(FIXTURE_PR.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.findings).toHaveLength(3);
  });

  it('listConventions parses accepted and pending rows', async () => {
    const { fetch } = createFakeFetch({
      [`GET /repos/${FIXTURE_REPO.id}/conventions`]: { status: 200, body: FIXTURE_CONVENTIONS },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const rows = await api.listConventions(FIXTURE_REPO.id);
    expect(rows).toHaveLength(3);
  });

  it('getBlast parses the blast response, stripping transport-only fields', async () => {
    const { fetch } = createFakeFetch({
      [`GET /pulls/${FIXTURE_PR.id}/blast`]: { status: 200, body: FIXTURE_BLAST },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const blast = await api.getBlast(FIXTURE_PR.id);
    expect(blast.downstream).toEqual(FIXTURE_BLAST.downstream);
    expect(Object.keys(blast)).not.toContain('indexed_sha');
  });
});

describe('createHttpApi — error mapping', () => {
  it('maps a 404 ApiErrorBody envelope to ApiError{kind:http,status:404,code}', async () => {
    const { fetch } = createFakeFetch({
      'GET /repos': {
        status: 404,
        body: { error: { code: 'not_found', message: 'Repo not found' } },
      },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.kind).toBe('http');
    expect(apiErr.status).toBe(404);
    expect(apiErr.code).toBe('not_found');
  });

  it('maps a connection failure to kind unreachable', async () => {
    const refusedFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const api = createHttpApi(BASE_CONFIG, refusedFetch);
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('unreachable');
  });

  it('maps a fake slower than the configured timeout to kind timeout', async () => {
    const { fetch } = createFakeFetch({
      'GET /repos': { status: 200, body: [FIXTURE_REPO], delayMs: 2_000 },
    });
    const api = createHttpApi({ ...BASE_CONFIG, httpTimeoutMs: 50 }, fetch);
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('timeout');
  });

  it('rejects a non-uuid id before calling fetch (0 recorded calls), with a correctly-attributed message (security review fix 8)', async () => {
    const { fetch, calls } = createFakeFetch({});
    const api = createHttpApi(BASE_CONFIG, fetch);
    const err = await api.listPulls('not-a-uuid').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.kind).toBe('invalid_input');
    // Never blamed on the API — nothing was ever sent.
    expect(apiErr.message).not.toContain('unexpected response');
    expect(apiErr.message).not.toContain('API returned');
    expect(calls).toHaveLength(0);
  });

  it('getBlast rejects a non-uuid prId before calling fetch (0 recorded calls)', async () => {
    const { fetch, calls } = createFakeFetch({});
    const api = createHttpApi(BASE_CONFIG, fetch);
    const err = await api.getBlast('not-a-uuid').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('invalid_input');
    expect(calls).toHaveLength(0);
  });

  it('a body failing schema validation maps to kind invalid_response', async () => {
    const { fetch } = createFakeFetch({
      'GET /agents': { status: 200, body: [{ nope: true }] },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const err = await api.listAgents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('invalid_response');
  });
});

describe('createHttpApi — auth header and token redaction', () => {
  it('sends no Authorization header when no token is configured', async () => {
    let sawAuthHeader = false;
    const spyFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      sawAuthHeader = headers.has('authorization');
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;
    const api = createHttpApi(BASE_CONFIG, spyFetch);
    await api.listRepos();
    expect(sawAuthHeader).toBe(false);
  });

  it('sends "Authorization: Bearer <token>" only when a token is configured', async () => {
    let authHeader: string | null = null;
    const spyFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      authHeader = headers.get('authorization');
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;
    const api = createHttpApi({ ...BASE_CONFIG, apiToken: 'my-secret-token' }, spyFetch);
    await api.listRepos();
    expect(authHeader).toBe('Bearer my-secret-token');
  });

  it('never lets the configured token leak into an ApiError message', async () => {
    // `createHttpApi` is side-effect free (arch review F1): registering the
    // token with `redact()` is the composition root's job (`src/index.ts`),
    // so tests must do it explicitly too.
    registerSecret('my-secret-token');
    const { fetch } = createFakeFetch({
      'GET /repos': {
        status: 500,
        body: { error: { code: 'internal_error', message: 'token my-secret-token failed auth' } },
      },
    });
    const api = createHttpApi({ ...BASE_CONFIG, apiToken: 'my-secret-token' }, fetch);
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).not.toContain('my-secret-token');
  });
});

describe('createHttpApi — side-effect free construction (arch review F1)', () => {
  it('does not register the configured token as a side effect of construction or a call', async () => {
    const { fetch } = createFakeFetch({
      'GET /repos': {
        status: 500,
        body: { error: { code: 'internal_error', message: 'token not-registered-by-client failed auth' } },
      },
    });
    // Deliberately NOT calling registerSecret — createHttpApi itself must not
    // do it either, so the raw token can still surface here.
    const api = createHttpApi({ ...BASE_CONFIG, apiToken: 'not-registered-by-client' }, fetch);
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain('not-registered-by-client');
  });
});

describe('createHttpApi — redirects (security review M3)', () => {
  it('passes redirect: "error" to fetch on every request', async () => {
    let sawRedirectOption: RequestInit['redirect'];
    const spyFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sawRedirectOption = init?.redirect;
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;
    const api = createHttpApi(BASE_CONFIG, spyFetch);
    await api.listRepos();
    expect(sawRedirectOption).toBe('error');
  });

  it('maps a fetch rejection shaped like a redirect error to a sensible ApiError, not "unreachable"', async () => {
    const redirectingFetch = (async () => {
      throw new TypeError('unexpected redirect');
    }) as typeof fetch;
    const api = createHttpApi(BASE_CONFIG, redirectingFetch);
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.kind).not.toBe('unreachable');
    expect(apiErr.message).toContain('redirect');
  });

  it('maps a well-formed 3xx response to an http ApiError naming the redirect', async () => {
    const { fetch } = createFakeFetch({
      'GET /repos': { status: 302, body: { error: { code: 'moved', message: 'moved' } } },
    });
    const api = createHttpApi(BASE_CONFIG, fetch);
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.kind).toBe('http');
    expect(apiErr.status).toBe(302);
    expect(apiErr.message).toContain('redirect');
  });
});
