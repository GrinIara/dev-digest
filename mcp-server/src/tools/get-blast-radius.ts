import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from './deps.js';
import { prField, repoField } from './shared-inputs.js';
import { ok } from '../domain/tool-result.js';

/**
 * Stub with a frozen, stable contract (§6b R7): the future implementation
 * changes only this handler's body, never `repo`/`pr` or the annotations.
 * Makes zero API calls.
 */
export function registerGetBlastRadius(server: McpServer, _deps: ServerDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get PR blast radius',
      description:
        'Impact map of a PR (changed symbols and downstream callers). Not implemented yet: returns status not_implemented. Use get_findings meanwhile.',
      inputSchema: {
        repo: repoField,
        pr: prField,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => {
      return ok(
        "Blast radius is not implemented yet. Do not retry; use get_findings for this PR's review results.",
        { status: 'not_implemented', repo: args.repo, pr: args.pr },
      );
    },
  );
}
