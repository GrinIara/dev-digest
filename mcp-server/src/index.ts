import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createHttpApi } from './api/client.js';
import { Resolver } from './domain/resolve.js';
import { createServer } from './server.js';
import { log, registerSecret } from './log.js';

/**
 * stdio entry point. stdout carries JSON-RPC exclusively (R1) — every log
 * line here goes to stderr via `log.*` (ESLint's `no-console` rule blocks
 * `console.log`, so this is structural, not just a convention).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  // Registered here, right after config loads, so `redact()` masks the
  // configured token in any log line or error message even where it doesn't
  // match a known secret-shape pattern (R12) — `createHttpApi` itself is
  // side-effect free (arch F1).
  registerSecret(config.apiToken);
  const api = createHttpApi(config);
  const resolver = new Resolver(api);
  const server = createServer({ api, config, resolver });

  await server.connect(new StdioServerTransport());
  log.info('devdigest MCP server ready', { apiUrl: config.apiUrl });
}

main().catch((err: unknown) => {
  log.error('fatal error starting devdigest MCP server', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
