import { describe, expect, it, afterEach } from 'vitest';
import { connect } from './helpers/connect.js';
import { createFakeFetch, FIXTURE_AGENTS } from './helpers/fake-api.js';
import { createHttpApi } from '../src/api/client.js';
import { Resolver } from '../src/domain/resolve.js';
import type { ServerDeps } from '../src/server.js';
import type { McpConfig } from '../src/config.js';
import type { Connected } from './helpers/connect.js';

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

let connected: Connected | undefined;

afterEach(async () => {
  await connected?.close();
  connected = undefined;
});

describe('list_agents', () => {
  it('returns the seeded agents with no system_prompt and no description over 160 chars', async () => {
    connected = await connect(deps({ 'GET /agents': { status: 200, body: FIXTURE_AGENTS } }));
    const result = await connected.client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    const json = JSON.parse(text.split('\n').slice(1).join('\n')) as { agents: Array<Record<string, unknown>> };
    expect(json.agents).toHaveLength(4);
    for (const agent of json.agents) {
      expect(agent.system_prompt).toBeUndefined();
      expect((agent.description as string).length).toBeLessThanOrEqual(160);
    }
    expect(text).toContain('4 agents (3 enabled).');
  });

  it('reports an unreachable API with a message pointing at ./scripts/dev.sh', async () => {
    const throwingFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    connected = await connect({
      api: createHttpApi(CONFIG, throwingFetch),
      config: CONFIG,
      resolver: new Resolver(createHttpApi(CONFIG, throwingFetch)),
    });
    const result = await connected.client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('./scripts/dev.sh');
  });

  it('returns a non-error hint when no agents are configured', async () => {
    connected = await connect(deps({ 'GET /agents': { status: 200, body: [] } }));
    const result = await connected.client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('No agents configured');
    expect(text).toContain('list_agents');
  });
});
