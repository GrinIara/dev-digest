/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
