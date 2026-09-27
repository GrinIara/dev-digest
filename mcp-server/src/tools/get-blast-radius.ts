import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from './deps.js';
import { prField, repoField } from './shared-inputs.js';
import { ApiError } from '../domain/ports.js';
import { ToolError, apiErrorToMessage, fail, ok } from '../domain/tool-result.js';
import { formatBlast } from '../domain/format.js';
import { log } from '../log.js';

/**
 * `repo`/`pr` and the annotations are a frozen public contract (§6a/T6):
 * only the description string and the handler body change from the stub.
 * Read-only, cheap (reads repo-intel's pre-built index, no reparse, no LLM) —
 * resolves repo/pr through the shared `Resolver`, calls `GET /pulls/:id/blast`
 * exactly once, and returns the same `downstream` map the UI renders.
 */
export function registerGetBlastRadius(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get PR blast radius',
      description:
        "Impact map of a PR: symbols declared in its changed files, their callers as file:line, and the HTTP endpoints and crons that may be affected. Read-only and cheap (pre-built index, no LLM); call it when asked what a change could break or before judging a PR's wider impact.",
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
    async (args) => {
      try {
        const repo = await deps.resolver.repo(args.repo);
        const prId = await deps.resolver.pull(repo.id, args.repo, args.pr);
        const blast = await deps.api.getBlast(prId);
        const { summary, payload } = formatBlast(blast, { repo: args.repo, pr: args.pr });
        // A degraded result (incomplete index) is not an error — the model
        // still gets whatever data exists, plus the degraded-reason hint.
        return ok(summary, payload);
      } catch (err) {
        if (err instanceof ToolError) {
          return fail(err.message);
        }
        if (err instanceof ApiError) {
          return fail(
            apiErrorToMessage(err, { apiUrl: deps.config.apiUrl, repo: args.repo, pr: args.pr }),
          );
        }
        log.error('get_blast_radius: unexpected error', {
          error: err instanceof Error ? err.message : String(err),
        });
        return fail(
          'Unexpected error in get_blast_radius; see the MCP server log (stderr). Retry once, then report it.',
        );
      }
    },
  );
}
