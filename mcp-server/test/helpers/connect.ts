import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import type { ServerDeps } from '../../src/server.js';

export interface Connected {
  client: Client;
  close: () => Promise<void>;
}

/**
 * Wires a real MCP `Client` to a real `McpServer` (built from `createServer`)
 * over `InMemoryTransport.createLinkedPair()` — no stdio, no subprocess, fully
 * hermetic. `deps.api` is expected to be backed by a fake `fetch`
 * (`test/helpers/fake-api.ts`) so tests exercise the whole tool pipeline
 * without a real DevDigest API.
 */
export async function connect(deps: ServerDeps): Promise<Connected> {
  const server = createServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
