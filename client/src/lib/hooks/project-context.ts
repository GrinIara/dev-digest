/* hooks/project-context.ts — React Query hooks for Project Context.
     GET  /repos/:id/context/docs                → ContextDocList
     GET  /repos/:id/context/docs/content?path=  → ContextDocContent
     PUT  /repos/:id/context/docs/content?path=  → save (raw Markdown)
     GET/PUT /agents/:id/context?repo_id=        → AgentContext
     GET/PUT /skills/:id/context?repo_id=        → SkillContext
   Key namespace is "project-context" — the older ["context", repoId] scaffold is unrelated. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  AgentContext,
  ContextAttachedRow,
  ContextDocContent,
  ContextDocList,
  SkillContext,
} from "../types";

/** No retry on 4xx (not_cloned / not found are deterministic). */
const retry = (n: number, e: unknown) =>
  !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2;

const docsKey = (repoId: string | null | undefined) => ["project-context", "docs", repoId] as const;

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: docsKey(repoId),
    queryFn: () => api.get<ContextDocList>(`/repos/${repoId}/context/docs`),
    enabled: !!repoId,
    retry,
  });
}

export function useContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["project-context", "doc", repoId, path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
    retry,
  });
}

export function useSaveContextDoc(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.put<ContextDocContent>(
        `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(path)}`,
        { content },
      ),
    onSuccess: (doc, vars) => {
      qc.setQueryData(["project-context", "doc", repoId, vars.path], doc);
      qc.invalidateQueries({ queryKey: docsKey(repoId) });
    },
  });
}

/** Shared shape of AgentContext / SkillContext for the optimistic update. */
type AttachedContext = { attached: ContextAttachedRow[] };

/** Optimistic PUT of the full ordered path set for `/{kind}s/:id/context`. */
function useSetOwnerContext<T extends AttachedContext>(
  kind: "agent" | "skill",
  ownerId: string | null | undefined,
  repoId: string | null | undefined,
) {
  const qc = useQueryClient();
  const key = ["project-context", kind, ownerId, repoId] as const;
  const url = `/${kind}s/${ownerId}/context?repo_id=${encodeURIComponent(repoId ?? "")}`;

  return useMutation({
    mutationFn: (paths: string[]) => api.put<T>(url, { paths }),
    onMutate: async (paths: string[]) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<T>(key);
      if (snapshot) {
        const byPath = new Map(snapshot.attached.map((r) => [r.path, r]));
        const attached = paths.map(
          (path): ContextAttachedRow =>
            byPath.get(path) ?? { path, type: null, tokens: null, status: "present" },
        );
        qc.setQueryData<T>(key, { ...snapshot, attached });
      }
      return { snapshot };
    },
    onError: (_e, _paths, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: docsKey(repoId) });
    },
  });
}

export function useAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-context", "agent", agentId, repoId],
    queryFn: () =>
      api.get<AgentContext>(
        `/agents/${agentId}/context?repo_id=${encodeURIComponent(repoId ?? "")}`,
      ),
    enabled: !!agentId && !!repoId,
    retry,
  });
}

export function useSetAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useSetOwnerContext<AgentContext>("agent", agentId, repoId);
}

export function useSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-context", "skill", skillId, repoId],
    queryFn: () =>
      api.get<SkillContext>(
        `/skills/${skillId}/context?repo_id=${encodeURIComponent(repoId ?? "")}`,
      ),
    enabled: !!skillId && !!repoId,
    retry,
  });
}

export function useSetSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useSetOwnerContext<SkillContext>("skill", skillId, repoId);
}
