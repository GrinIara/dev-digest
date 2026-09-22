/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, AgentSkillLink, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (Settings → Feature Models picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** Dynamic model list merged across every provider (Config tab's cross-provider
   picker) — each provider's own failure degrades to `[]` server-side, so this
   never throws just because one provider's key is missing/invalid. */
export function useAllModels() {
  return useQuery({
    queryKey: ["all-models"],
    queryFn: () => api.get<ModelInfo[]>("/models"),
    staleTime: 5 * 60_000,
  });
}

/** This agent's linked skills, ordered (Skills tab's bound/checked state). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsInput {
  id: string;
  /** Full ordered set of bound skill ids — replaces the agent's linked skills. */
  skillIds: string[];
}

/** Set/reorder the agent's FULL linked-skill set in one call (Skills tab). */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, skillIds }: SetAgentSkillsInput) =>
      api.post<AgentSkillLink[]>(`/agents/${id}/skills`, { skill_ids: skillIds }),
    onSuccess: (data, { id }) => qc.setQueryData(["agent-skills", id], data),
  });
}

export interface LinkAgentSkillInput {
  agentId: string;
  skillId: string;
}

/** Append one skill to an agent's linked set, without touching the rest
 *  (server's `skill_id` branch, additive — as opposed to `useSetAgentSkills`'s
 *  full-set replace). Used by the Conventions Extractor's create-skill flow. */
export function useLinkAgentSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillId }: LinkAgentSkillInput) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_id: skillId }),
    onSuccess: (data, { agentId }) => qc.setQueryData(["agent-skills", agentId], data),
  });
}

/** agent id -> number of skills currently bound to it. Fires one
 *  `GET /agents/:id/skills` per visible agent (fine for a small workspace —
 *  mirrors `useSkillUsageCounts`'s N+1 shape in `hooks/skills.ts`, reimplemented
 *  locally here rather than imported since that file is owned by a concurrent
 *  Skills Lab pass). Feeds `AgentCard`'s `skillCount` badge from both the
 *  Agents list and the Agent Editor's sidebar. */
export function useAgentSkillCounts(agents: Agent[] | undefined): Map<string, number> {
  const list = agents ?? [];
  const results = useQueries({
    queries: list.map((a) => ({
      queryKey: ["agent-skills", a.id],
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${a.id}/skills`),
    })),
  });
  const counts = new Map<string, number>();
  list.forEach((a, i) => {
    const data = results[i]?.data;
    if (data) counts.set(a.id, data.length);
  });
  return counts;
}
