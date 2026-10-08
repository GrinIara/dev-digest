/**
 * project-context HTTP module.
 *
 *   GET /repos/:id/context/docs                → ContextDocList (discovered docs)
 *   GET /repos/:id/context/docs/content?path=  → ContextDocContent
 *   PUT /repos/:id/context/docs/content?path= {content} → ContextDocContent (overwrites a discovered doc in the clone)
 *   GET /agents/:id/context?repo_id=           → AgentContext
 *   PUT /agents/:id/context?repo_id=  {paths}  → AgentContext (replaces the ordered set)
 *   GET /skills/:id/context?repo_id=           → SkillContext
 *   PUT /skills/:id/context?repo_id=  {paths}  → SkillContext
 *
 * 404 for an unknown repo/agent/skill (workspace-scoped), 409 `not_cloned` when
 * the repo has no clone, 422 when a newly added path is not a discovered doc.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ContextDocPathQuery,
  ContextRepoQuery,
  SaveContextDocBody,
  SetContextAttachmentsBody,
  type AgentContext,
  type ContextDocContent,
  type ContextDocList,
  type SkillContext,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ProjectContextService(container);

  app.get(
    '/repos/:id/context/docs',
    { schema: { params: IdParams } },
    async (req): Promise<ContextDocList> => {
      const { workspaceId } = await getContext(container, req);
      return service.listDocs(workspaceId, req.params.id, req.log);
    },
  );

  app.get(
    '/repos/:id/context/docs/content',
    { schema: { params: IdParams, querystring: ContextDocPathQuery } },
    async (req): Promise<ContextDocContent> => {
      const { workspaceId } = await getContext(container, req);
      return service.getDoc(workspaceId, req.params.id, req.query.path, req.log);
    },
  );

  app.put(
    '/repos/:id/context/docs/content',
    { schema: { params: IdParams, querystring: ContextDocPathQuery, body: SaveContextDocBody } },
    async (req): Promise<ContextDocContent> => {
      const { workspaceId } = await getContext(container, req);
      return service.saveDoc(workspaceId, req.params.id, req.query.path, req.body.content, req.log);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery } },
    async (req): Promise<AgentContext> => {
      const { workspaceId } = await getContext(container, req);
      return service.getAgentContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery, body: SetContextAttachmentsBody } },
    async (req): Promise<AgentContext> => {
      const { workspaceId } = await getContext(container, req);
      return service.setAgentContext(workspaceId, req.params.id, req.query.repo_id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery } },
    async (req): Promise<SkillContext> => {
      const { workspaceId } = await getContext(container, req);
      return service.getSkillContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery, body: SetContextAttachmentsBody } },
    async (req): Promise<SkillContext> => {
      const { workspaceId } = await getContext(container, req);
      return service.setSkillContext(workspaceId, req.params.id, req.query.repo_id, req.body.paths);
    },
  );
}
