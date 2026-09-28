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
import { formatFindingsList, formatReview } from '../domain/format.js';
import { log } from '../log.js';

/**
 * Reads finished review(s) — by `run_id` (a single run, sharing `formatReview`
 * and the failed/cancelled messages with `run_agent_on_pr` so both tools'
 * single-review output is identical in shape), or, when `run_id` is omitted,
 * every agent's latest `kind === 'review'` review for the PR in one call
 * (`formatFindingsList`), optionally narrowed to one agent via `agent`. The
 * documented fallback after a `run_agent_on_pr` timeout (§6a).
 */
export function registerGetFindings(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get review findings',
      description:
        "Get the verdict and findings of a finished DevDigest review. Pass the run_id from run_agent_on_pr for that one run, or omit it to get every agent's latest review for the PR in one call (optionally filtered to one agent). Use this instead of re-running a review.",
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

        if (args.run_id) {
          const runId = args.run_id;
          const runs = await deps.api.listRuns(prId);
          const run = runs.find((r) => r.run_id === runId);
          if (!run) {
            return fail(
              `run_id ${runId} is not a run of ${args.repo}#${args.pr}. Omit run_id to get every agent's latest review, or check repo/pr.`,
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
          const review = reviews.find((r) => r.run_id === runId);
          if (!review) {
            return fail(reviewMissingForRunMessage(runId));
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
        }

        // No run_id: every agent's latest 'review'-kind review for the PR,
        // one call (mentor review — previously only a single review, chosen
        // ambiguously, was returned here).
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

        // Latest review per agent (grouped by agent_id, falling back to
        // agent_name, then the review's own id if both are somehow absent).
        const latestByAgent = new Map<string, ReviewLite>();
        for (const r of candidates) {
          const key = r.agent_id ?? r.agent_name ?? r.id;
          const existing = latestByAgent.get(key);
          if (!existing || r.created_at > existing.created_at) {
            latestByAgent.set(key, r);
          }
        }
        const latestReviews = [...latestByAgent.values()];

        if (latestReviews.length === 0) {
          const forAgent = agentName ? ` for agent ${agentName}` : '';
          return fail(
            `PR ${args.repo}#${args.pr} has no finished review${forAgent}. Call run_agent_on_pr(repo, pr, agent) to start one.`,
          );
        }

        const { payload, summary } = formatFindingsList(latestReviews, {
          repo: args.repo,
          pr: args.pr,
          ...(args.min_severity ? { minSeverity: args.min_severity } : {}),
          ...(args.max_findings !== undefined ? { maxFindings: args.max_findings } : {}),
          detailed: args.response_format === 'detailed',
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
