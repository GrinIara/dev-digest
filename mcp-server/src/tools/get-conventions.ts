import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from './deps.js';
import { categoryField, conventionsResponseFormat, maxRulesField, repoField } from './shared-inputs.js';
import { ApiError } from '../domain/ports.js';
import { ToolError, apiErrorToMessage, fail, ok } from '../domain/tool-result.js';
import { formatConventions } from '../domain/format.js';
import { log } from '../log.js';

export function registerGetConventions(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repo conventions',
      description:
        "Get the house conventions a maintainer accepted for a repo (from DevDigest's Conventions Extractor). Use them to check code against the repo's own rules. Does not start a scan.",
      inputSchema: {
        repo: repoField,
        category: categoryField,
        max_rules: maxRulesField,
        response_format: conventionsResponseFormat,
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
        const rows = await deps.api.listConventions(repo.id);

        if (rows.length === 0) {
          return ok(
            `No conventions extracted for ${args.repo} yet. Run the Conventions scan in the DevDigest UI (it costs one model call). get_conventions does not start scans.`,
            { repo: args.repo, total_accepted: 0, pending: 0, rules: [] },
          );
        }

        const acceptedCount = rows.filter((r) => r.status === 'accepted').length;
        const pendingCount = rows.filter((r) => r.status === 'pending').length;
        if (acceptedCount === 0 && pendingCount > 0) {
          return ok(
            `${pendingCount} convention candidates await review. Accept them in DevDigest (repo → Conventions), then call get_conventions again.`,
            { repo: args.repo, total_accepted: 0, pending: pendingCount, rules: [] },
          );
        }

        const { payload, summary } = formatConventions(rows, {
          repo: args.repo,
          ...(args.category !== undefined ? { category: args.category } : {}),
          ...(args.max_rules !== undefined ? { maxRules: args.max_rules } : {}),
          detailed: args.response_format === 'detailed',
        });
        return ok(summary, payload);
      } catch (err) {
        if (err instanceof ToolError) {
          return fail(err.message);
        }
        if (err instanceof ApiError) {
          return fail(apiErrorToMessage(err, { apiUrl: deps.config.apiUrl, repo: args.repo }));
        }
        log.error('get_conventions: unexpected error', {
          error: err instanceof Error ? err.message : String(err),
        });
        return fail(
          'Unexpected error in get_conventions; see the MCP server log (stderr). Retry once, then report it.',
        );
      }
    },
  );
}
