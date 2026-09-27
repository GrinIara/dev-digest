import { describe, expect, it, afterEach } from 'vitest';
import { connect } from './helpers/connect.js';
import { createFakeFetch } from './helpers/fake-api.js';
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

describe('get_blast_radius', () => {
  it('returns a non-error not_implemented stub and makes zero API calls', async () => {
    const { fetch, calls } = createFakeFetch({});
    const api = createHttpApi(CONFIG, fetch);
    connected = await connect({ api, config: CONFIG, resolver: new Resolver(api) });

    const result = await connected.client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr: 482 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('Do not retry');
    expect(text).toContain('get_findings');
    const payload = JSON.parse(text.split('\n').slice(1).join('\n')) as { status: string };
    expect(payload.status).toBe('not_implemented');
    expect(calls).toHaveLength(0);
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
