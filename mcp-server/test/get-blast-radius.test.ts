import { describe, expect, it, afterEach } from 'vitest';
import { connect } from './helpers/connect.js';
import { createFakeFetch, FIXTURE_REPO, FIXTURE_PR, FIXTURE_BLAST, FIXTURE_BLAST_DEGRADED } from './helpers/fake-api.js';
import { createHttpApi } from '../src/api/client.js';
import { Resolver } from '../src/domain/resolve.js';
import type { McpConfig } from '../src/config.js';
import type { Connected } from './helpers/connect.js';

const CONFIG: McpConfig = {
  apiUrl: 'http://localhost:3001',
  waitMs: 120_000,
  pollMs: 2_000,
  httpTimeoutMs: 15_000,
};

let connected: Connected | undefined;

afterEach(async () => {
  await connected?.close();
  connected = undefined;
});

function textOf(result: Awaited<ReturnType<Connected['client']['callTool']>>): string {
  return (result.content as Array<{ type: string; text: string }>)[0]!.text;
}

describe('get_blast_radius', () => {
  it('resolves repo/pr, calls /blast exactly once, and returns the same downstream map', async () => {
    const { fetch, calls } = createFakeFetch({
      'GET /repos': { status: 200, body: [FIXTURE_REPO] },
      [`GET /repos/${FIXTURE_REPO.id}/pulls`]: { status: 200, body: [FIXTURE_PR] },
      [`GET /pulls/${FIXTURE_PR.id}/blast`]: { status: 200, body: FIXTURE_BLAST },
    });
    const api = createHttpApi(CONFIG, fetch);
    connected = await connect({ api, config: CONFIG, resolver: new Resolver(api) });

    const result = await connected.client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number },
    });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    const payload = JSON.parse(text.split('\n').slice(1).join('\n')) as { downstream: unknown };
    expect(payload.downstream).toEqual(FIXTURE_BLAST.downstream);

    const blastCalls = calls.filter((c) => c.path === `/pulls/${FIXTURE_PR.id}/blast`);
    expect(blastCalls).toHaveLength(1);
  });

  it('a degraded response is not an error and the text names the reason', async () => {
    const { fetch } = createFakeFetch({
      'GET /repos': { status: 200, body: [FIXTURE_REPO] },
      [`GET /repos/${FIXTURE_REPO.id}/pulls`]: { status: 200, body: [FIXTURE_PR] },
      [`GET /pulls/${FIXTURE_PR.id}/blast`]: { status: 200, body: FIXTURE_BLAST_DEGRADED },
    });
    const api = createHttpApi(CONFIG, fetch);
    connected = await connect({ api, config: CONFIG, resolver: new Resolver(api) });

    const result = await connected.client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('Index incomplete (no_data)');
  });

  it('an unknown PR number fails with a forward-leading message and makes no /blast call', async () => {
    const { fetch, calls } = createFakeFetch({
      'GET /repos': { status: 200, body: [FIXTURE_REPO] },
      [`GET /repos/${FIXTURE_REPO.id}/pulls`]: { status: 200, body: [FIXTURE_PR] },
    });
    const api = createHttpApi(CONFIG, fetch);
    connected = await connect({ api, config: CONFIG, resolver: new Resolver(api) });

    const result = await connected.client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: FIXTURE_REPO.full_name, pr: 999 },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('PR #999 not found');
    expect(calls.some((c) => c.path.endsWith('/blast'))).toBe(false);
  });

  it('a /blast 404 fails with the mapped API message', async () => {
    const { fetch } = createFakeFetch({
      'GET /repos': { status: 200, body: [FIXTURE_REPO] },
      [`GET /repos/${FIXTURE_REPO.id}/pulls`]: { status: 200, body: [FIXTURE_PR] },
      [`GET /pulls/${FIXTURE_PR.id}/blast`]: {
        status: 404,
        body: { error: { code: 'not_found', message: 'Pull request not found' } },
      },
    });
    const api = createHttpApi(CONFIG, fetch);
    connected = await connect({ api, config: CONFIG, resolver: new Resolver(api) });

    const result = await connected.client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: FIXTURE_REPO.full_name, pr: FIXTURE_PR.number },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Pull request not found');
  });

  it('rejects an invalid repo via schema validation', async () => {
    const { fetch, calls } = createFakeFetch({});
    const api = createHttpApi(CONFIG, fetch);
    connected = await connect({ api, config: CONFIG, resolver: new Resolver(api) });

    // The SDK validates `inputSchema` server-side before the handler runs and
    // surfaces a failure as `isError: true` (not a rejected RPC promise).
    const result = await connected.client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'not-a-slug', pr: 1 },
    });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
