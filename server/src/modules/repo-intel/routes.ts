/**
 * repo-intel HTTP module.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 *                                  404 for an unknown/foreign-workspace repo, 409
 *                                  `repo_not_cloned` when not cloned yet, 409 `local_edits`
 *                                  (details.paths) when project-context docs have local
 *                                  edits, unless ?discard_local_edits=true
 *                                  (see assertResyncable).
 *
 * Job-handler registration lives here: this plugin runs once at app boot and
 * calls `RepoIntelService.registerIndexJobHandlers()` so INDEX/REFRESH jobs
 * enqueued by `repos/service.ts` (after clone / on refresh) have a handler
 * to run against. Mirrors the `RepoService.registerCloneJobHandler()` shape.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ResyncQuery } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoIntelService } from './service.js';
import { RESYNC_JOB_KIND } from './constants.js';
import type { IndexState } from './types.js';

export default async function repoIntelRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Register the INDEX/REFRESH handlers exactly once at module load. Using a
  // local service here (instead of `container.repoIntel`) is fine — the
  // JobRunner stores the handler closure, not the service instance, and the
  // lazy `container.repoIntel` getter constructs its own service for read
  // calls. Both share the same DB, so behaviour is identical.
  const service = new RepoIntelService(container);
  service.registerIndexJobHandlers();

  app.get(
    '/repos/:id/index-state',
    { schema: { params: IdParams } },
    async (req): Promise<IndexState> => {
      // Resolve tenancy so the request is workspace-scoped even though the
      // facade itself is tenant-agnostic (consistent with blast routes).
      await getContext(container, req);
      return container.repoIntel.getIndexState(req.params.id);
    },
  );

  app.post(
    '/repos/:id/resync',
    { schema: { params: IdParams, querystring: ResyncQuery } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      // Fail fast when the resync can't possibly do anything (unknown repo,
      // or no clone yet) instead of enqueueing a job that degrades silently.
      await service.assertResyncable(workspaceId, req.params.id, {
        discardLocalEdits: req.query.discard_local_edits === 'true',
        log: req.log,
      });
      // 202 even when enqueue fails (no handler / DB hiccup) so the UI can
      // still poll /index-state without an inline error path. The actual
      // outcome shows up in `repo_index_state` once the worker runs.
      let jobId: string | null = null;
      try {
        const job = await container.jobs.enqueue(workspaceId, RESYNC_JOB_KIND, {
          repoId: req.params.id,
        });
        jobId = job.id;
      } catch {
        // swallow — degraded path
      }
      reply.code(202);
      return jobId
        ? { status: 'accepted', jobId }
        : { status: 'accepted', degraded: true, reason: 'no_handler' };
    },
  );
}
