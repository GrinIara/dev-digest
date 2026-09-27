import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from './deps.js';
import {
  agentField,
  findingsResponseFormat,
  maxFindingsField,
  minSeverityField,
  prField,
  repoField,
  runIdField,
} from './shared-inputs.js';
import { ApiError } from '../domain/ports.js';
import type { ReviewLite } from '../domain/ports.js';
import {
  ToolError,
  apiErrorToMessage,
  fail,
  ok,
  reviewMissingForRunMessage,
  runCancelledMessage,
  runFailedMessage,
} from '../domain/tool-result.js';
import { formatReview } from '../domain/format.js';
import { log } from '../log.js';

/**
 * Reads a finished review — identified by `run_id`, or the PR's latest review
 * when omitted — sharing `formatReview` and the failed/cancelled messages
 * with `run_agent_on_pr` so both tools' outputs are identical in shape. The
 * documented fallback after an `run_agent_on_pr` timeout (§6a).
 */
export function registerGetFindings(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get review findings',
      description:
        "Get the verdict and findings of a finished DevDigest review. Pass the run_id from run_agent_on_pr, or omit it to get the PR's latest review (optionally for one agent). Use this instead of re-running a review.",
      inputSchema: {
        repo: repoField,
        pr: prField,
        run_id: runIdField,
        agent: agentField.optional(),
        min_severity: minSeverityField,
        max_findings: maxFindingsField,
        response_format: findingsResponseFormat,
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

        let review: ReviewLite | undefined;

        if (args.run_id) {
          const runId = args.run_id;
          const runs = await deps.api.listRuns(prId);
          const run = runs.find((r) => r.run_id === runId);
          if (!run) {
            return fail(
              `run_id ${runId} is not a run of ${args.repo}#${args.pr}. Omit run_id to get the latest review, or check repo/pr.`,
            );
          }
          if (run.status === 'failed') {
            return fail(runFailedMessage(runId, run.error));
          }
          if (run.status === 'cancelled') {
            return fail(runCancelledMessage(runId));
          }
          if (run.status !== 'done') {
            // 'running', null, or an unrecognized status.
            return ok(`Run ${runId} is still running; call get_findings again in ~30 s.`, {
              status: 'running',
              run_id: runId,
              repo: args.repo,
              pr: args.pr,
            });
          }
          const reviews = await deps.api.listReviews(prId);
          review = reviews.find((r) => r.run_id === runId);
          if (!review) {
            return fail(reviewMissingForRunMessage(runId));
          }
        } else {
          const reviews = await deps.api.listReviews(prId);
          let candidates = reviews.filter((r) => r.kind === 'review');

          let agentName: string | undefined;
          if (args.agent) {
            const agent = await deps.resolver.agent(args.agent);
            agentName = agent.name;
            const lowerName = agent.name.toLowerCase();
            candidates = candidates.filter(
              (r) => r.agent_id === agent.id || (r.agent_name?.toLowerCase() ?? '') === lowerName,
            );
          }

          candidates = [...candidates].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          review = candidates[0];

          if (!review) {
            const forAgent = agentName ? ` for agent ${agentName}` : '';
            return fail(
              `PR ${args.repo}#${args.pr} has no finished review${forAgent}. Call run_agent_on_pr(repo, pr, agent) to start one.`,
            );
          }
        }

        const { payload, summary } = formatReview(review, {
          runId: review.run_id ?? '',
          repo: args.repo,
          pr: args.pr,
          agent: review.agent_name ?? args.agent ?? 'unknown',
          ...(args.min_severity ? { minSeverity: args.min_severity } : {}),
          ...(args.max_findings !== undefined ? { maxFindings: args.max_findings } : {}),
          detailed: args.response_format === 'detailed',
          includeCreatedAt: true,
        });
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
        log.error('get_findings: unexpected error', {
          error: err instanceof Error ? err.message : String(err),
        });
        return fail(
          'Unexpected error in get_findings; see the MCP server log (stderr). Retry once, then report it.',
        );
      }
    },
  );
}
