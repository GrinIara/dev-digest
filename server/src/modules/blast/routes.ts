import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast module. GET /pulls/:id/blast reads the repo-intel read model through
 * the facade (`container.repoIntel`) — it never reparses, clones or calls the
 * LLM/GitHub/embedder adapters (R3). The `response` schema uses the
 * already-registered zod serializerCompiler (`src/app.ts`), so a response
 * that doesn't match `BlastRadiusResponse` fails loudly instead of leaking.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req): Promise<BlastRadiusResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlast(workspaceId, req.params.id, req.log);
    },
  );
}
