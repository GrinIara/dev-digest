import { describe, expect, it, afterEach } from 'vitest';
import { connect } from './helpers/connect.js';
import { createFakeFetch, FIXTURE_REPO, FIXTURE_CONVENTIONS } from './helpers/fake-api.js';
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

function deps(routes: Parameters<typeof createFakeFetch>[0]): ServerDeps {
  const { fetch } = createFakeFetch(routes);
  const api = createHttpApi(CONFIG, fetch);
  return { api, config: CONFIG, resolver: new Resolver(api) };
}

function textOf(result: CallToolResult): string {
  return (result.content as Array<{ type: string; text: string }>)[0]!.text;
}

function payloadOf<T>(result: CallToolResult): T {
  const text = textOf(result);
  return JSON.parse(text.split('\n').slice(1).join('\n')) as T;
}

let connected: Connected | undefined;

afterEach(async () => {
  await connected?.close();
  connected = undefined;
});

describe('get_conventions', () => {
  it('returns only accepted rules and the pending count', async () => {
    connected = await connect(
      deps({
        'GET /repos': { status: 200, body: [FIXTURE_REPO] },
        [`GET /repos/${FIXTURE_REPO.id}/conventions`]: { status: 200, body: FIXTURE_CONVENTIONS },
      }),
    );
    const result = (await connected.client.callTool({
      name: 'get_conventions',
      arguments: { repo: FIXTURE_REPO.full_name },
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
    const payload = payloadOf<{ total_accepted: number; pending: number; rules: unknown[] }>(result);
    expect(payload.total_accepted).toBe(2);
    expect(payload.pending).toBe(1);
    expect(payload.rules).toHaveLength(2);
  });

  it('returns a non-error hint when there are 0 accepted but pending candidates', async () => {
    connected = await connect(
      deps({
        'GET /repos': { status: 200, body: [FIXTURE_REPO] },
        [`GET /repos/${FIXTURE_REPO.id}/conventions`]: {
          status: 200,
          body: FIXTURE_CONVENTIONS.filter((c) => c.status !== 'accepted'),
        },
      }),
    );
    const result = (await connected.client.callTool({
      name: 'get_conventions',
      arguments: { repo: FIXTURE_REPO.full_name },
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('await review');
  });

  it('returns a non-error "scan" hint when no conventions were extracted at all', async () => {
    connected = await connect(
      deps({
        'GET /repos': { status: 200, body: [FIXTURE_REPO] },
        [`GET /repos/${FIXTURE_REPO.id}/conventions`]: { status: 200, body: [] },
      }),
    );
    const result = (await connected.client.callTool({
      name: 'get_conventions',
      arguments: { repo: FIXTURE_REPO.full_name },
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('does not start scans');
  });

  it('caps at max_rules and reports omitted with a hint', async () => {
    connected = await connect(
      deps({
        'GET /repos': { status: 200, body: [FIXTURE_REPO] },
        [`GET /repos/${FIXTURE_REPO.id}/conventions`]: { status: 200, body: FIXTURE_CONVENTIONS },
      }),
    );
    const result = (await connected.client.callTool({
      name: 'get_conventions',
      arguments: { repo: FIXTURE_REPO.full_name, max_rules: 1 },
    })) as CallToolResult;
    const payload = payloadOf<{ rules: unknown[]; omitted: number }>(result);
    expect(payload.rules).toHaveLength(1);
    expect(payload.omitted).toBe(1);
    expect(textOf(result)).toContain('max_rules');
  });

  it('reports an unknown repo as isError, mentioning adding the repo', async () => {
    connected = await connect(deps({ 'GET /repos': { status: 200, body: [] } }));
    const result = (await connected.client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/missing' },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('DevDigest home page');
  });
});
