import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from './deps.js';
import { agentField, prField, repoField } from './shared-inputs.js';
import { ApiError } from '../domain/ports.js';
import {
  ToolError,
  apiErrorToMessage,
  fail,
  ok,
  reviewMissingForRunMessage,
  runCancelledMessage,
  runFailedMessage,
  startReviewMayHaveStartedMessage,
} from '../domain/tool-result.js';
import { waitForRun } from '../domain/wait.js';
import { formatReview } from '../domain/format.js';
import { log } from '../log.js';

/**
 * The only write tool (§6a). Resolves agent/repo/PR, starts exactly one run
 * (`POST /pulls/:id/review` — never retried, even on a transient failure
 * afterwards), waits up to `config.waitMs`, and returns findings or a
 * non-error "still running" result that steers the model to `get_findings`
 * instead of a second paid run.
 */
export function registerRunAgentOnPr(server: McpServer, deps: ServerDeps): void {
  const waitS = Math.round(deps.config.waitMs / 1_000);

  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run agent on PR',
      description: `Run one reviewer agent on a pull request and wait for its findings (up to ~${waitS}s). Starts a paid LLM run, so call it once per request. If it returns status "running", call get_findings with the returned run_id.`,
      inputSchema: {
        repo: repoField,
        pr: prField,
        agent: agentField,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      let startedRunId: string | undefined;
      try {
        const agent = await deps.resolver.agent(args.agent);
        const repo = await deps.resolver.repo(args.repo);
        const prId = await deps.resolver.pull(repo.id, args.repo, args.pr);

        // POST /pulls/:id/review is called exactly once here — never retried,
        // including on a later transient error while polling (§6a Risk). A
        // 'timeout' or 'invalid_response' on this specific call is handled
        // separately below (security review M1): the request may already
        // have reached the server, so the model must never be told to retry
        // run_agent_on_pr itself, only to check get_findings.
        let trigger: Awaited<ReturnType<typeof deps.api.startReview>>;
        try {
          trigger = await deps.api.startReview(prId, agent.id);
        } catch (err) {
          if (err instanceof ApiError && (err.kind === 'timeout' || err.kind === 'invalid_response')) {
            return fail(startReviewMayHaveStartedMessage(err, { repo: args.repo, pr: args.pr }));
          }
          throw err;
        }
        const target = trigger.runs[0];
        if (!target) {
          throw new ToolError('API started no run; retry run_agent_on_pr once.');
        }
        startedRunId = target.run_id;

        const progressToken = extra._meta?.progressToken;
        const onProgress =
          progressToken === undefined
            ? undefined
            : (elapsedMs: number, totalMs: number) => {
                const elapsedS = Math.round(elapsedMs / 1_000);
                extra
                  .sendNotification({
                    method: 'notifications/progress',
                    params: {
                      progressToken,
                      progress: elapsedS,
                      total: Math.round(totalMs / 1_000),
                      message: `run ${target.run_id} running (${elapsedS}s)`,
                    },
                  })
                  .catch(() => {
                    // Progress is best-effort; a failed notification never fails the call.
                  });
              };

        const wait = await waitForRun({
          api: deps.api,
          prId,
          runId: target.run_id,
          waitMs: deps.config.waitMs,
          pollMs: deps.config.pollMs,
          signal: extra.signal,
          ...(deps.sleep ? { sleep: deps.sleep } : {}),
          ...(deps.now ? { now: deps.now } : {}),
          ...(onProgress ? { onProgress } : {}),
        });

        if (wait.state === 'running') {
          return ok(
            `Review still running after ${waitS}s. Call get_findings with repo=${args.repo}, pr=${args.pr}, run_id=${target.run_id} in about 30 s. Do NOT call run_agent_on_pr again; that would start a second paid run.`,
            {
              status: 'running',
              run_id: target.run_id,
              repo: args.repo,
              pr: args.pr,
              agent: agent.name,
              waited_s: waitS,
            },
          );
        }
        if (wait.state === 'failed') {
          return fail(runFailedMessage(target.run_id, wait.run?.error));
        }
        if (wait.state === 'cancelled') {
          return fail(runCancelledMessage(target.run_id));
        }

        const reviews = await deps.api.listReviews(prId);
        const review = reviews.find((r) => r.run_id === target.run_id);
        if (!review) {
          return fail(reviewMissingForRunMessage(target.run_id));
        }

        const { payload, summary } = formatReview(review, {
          runId: target.run_id,
          repo: args.repo,
          pr: args.pr,
          agent: agent.name,
        });
        return ok(summary, payload);
      } catch (err) {
        if (err instanceof ToolError) {
          return fail(err.message);
        }
        if (err instanceof ApiError) {
          return fail(
            apiErrorToMessage(err, {
              apiUrl: deps.config.apiUrl,
              repo: args.repo,
              pr: args.pr,
              ...(startedRunId ? { runId: startedRunId } : {}),
            }),
          );
        }
        log.error('run_agent_on_pr: unexpected error', {
          error: err instanceof Error ? err.message : String(err),
        });
        return fail(
          'Unexpected error in run_agent_on_pr; see the MCP server log (stderr). Retry once, then report it.',
        );
      }
    },
  );
}
