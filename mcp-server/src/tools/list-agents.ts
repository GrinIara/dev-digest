import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from './deps.js';
import { ApiError } from '../domain/ports.js';
import { apiErrorToMessage, fail, ok } from '../domain/tool-result.js';
import { formatAgents } from '../domain/format.js';
import { log } from '../log.js';

export function registerListAgents(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List reviewer agents',
      description:
        "List the reviewer agents configured in DevDigest. Use an agent's id or name as the `agent` argument of run_agent_on_pr.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const agents = await deps.api.listAgents();

        if (agents.length === 0) {
          return ok(
            'No agents configured. Create one on the DevDigest Agents page, then call list_agents again.',
            { agents: [] },
          );
        }

        const { agents: concise, enabledCount, omitted } = formatAgents(agents);
        let summary = `${concise.length} agents (${enabledCount} enabled).`;
        if (omitted > 0) {
          summary += ` ${omitted} agent(s) omitted to keep the response small; disable unused agents in DevDigest, then call list_agents again.`;
        }
        return ok(summary, { agents: concise, omitted });
      } catch (err) {
        if (err instanceof ApiError) {
          return fail(apiErrorToMessage(err, { apiUrl: deps.config.apiUrl }));
        }
        log.error('list_agents: unexpected error', {
          error: err instanceof Error ? err.message : String(err),
        });
        return fail(
          'Unexpected error in list_agents; see the MCP server log (stderr). Retry once, then report it.',
        );
      }
    },
  );
}
