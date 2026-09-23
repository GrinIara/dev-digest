import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalOwnerKind } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/**
 * Eval module — owner-agnostic over `eval_cases`/`eval_runs` (owner_kind
 * 'skill' | 'agent'). Serves both a future Skill "Evals" tab and a future
 * Agent "Evals" tab from one implementation.
 *
 *   GET    /eval-cases              → list (workspace-scoped; filterable by owner_kind/owner_id)
 *   GET    /eval-cases/:id          → one case
 *   POST   /eval-cases              → create
 *   PATCH  /eval-cases/:id          → partial update
 *   DELETE /eval-cases/:id          → delete (cascades eval_runs)
 *   GET    /eval-cases/:id/runs     → run history, newest first
 *   POST   /eval-cases/:id/run      → "Run on evals" — dispatch to the skill-
 *                                      or agent-owner review path, persist one
 *                                      eval_runs row, return it.
 */

const ListEvalCasesQuery = z.object({
  owner_kind: EvalOwnerKind.optional(),
  owner_id: z.string().uuid().optional(),
});

const CreateEvalCaseBody = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string().uuid(),
  name: z.string().min(1),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.unknown().optional(),
  notes: z.string().optional(),
});

/** owner_kind/owner_id are set at creation and not repatchable — identity of the case. */
const UpdateEvalCaseBody = z.object({
  name: z.string().min(1).optional(),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.unknown().optional(),
  notes: z.string().optional(),
});

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  app.get('/eval-cases', { schema: { querystring: ListEvalCasesQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { owner_kind, owner_id } = req.query;
    return service.list(workspaceId, { ownerKind: owner_kind, ownerId: owner_id });
  });

  app.get('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const kase = await service.get(workspaceId, req.params.id);
    if (!kase) throw new NotFoundError('Eval case not found');
    return kase;
  });

  app.post('/eval-cases', { schema: { body: CreateEvalCaseBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const kase = await service.create(workspaceId, req.body);
    reply.status(201);
    return kase;
  });

  app.patch(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: UpdateEvalCaseBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const kase = await service.update(workspaceId, req.params.id, req.body);
      if (!kase) throw new NotFoundError('Eval case not found');
      return kase;
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });

  app.get('/eval-cases/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const runs = await service.listRuns(workspaceId, req.params.id);
    if (!runs) throw new NotFoundError('Eval case not found');
    return runs;
  });

  app.post('/eval-cases/:id/run', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const run = await service.run(workspaceId, req.params.id);
    if (!run) throw new NotFoundError('Eval case not found');
    return run;
  });
}
