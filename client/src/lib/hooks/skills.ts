/* hooks/skills.ts — React Query hooks for the Skills Lab (list + detail tabs).
   Mirrors hooks/agents.ts's shape; also composes the agents hooks (read-only,
   never mutated here) to derive "used by N agents" stats, since the backend
   has no batched skill-usage endpoint (see A.6 scope-cut note in the Stats
   tab / SkillsListView). */
"use client";

import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, AgentSkillLink, Skill, SkillSource, SkillType, SkillVersion } from "@devdigest/shared";
import { useAgents } from "./agents";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  evidence_files?: string[];
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled" | "evidence_files">> & {
    /** "Describe your change" input; blank/omitted lets the server default it. */
    change_summary?: string;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.patch<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-token-count", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillTokenCount(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-token-count", id],
    queryFn: () => api.get<{ tokens: number }>(`/skills/${id}/token-count`),
    enabled: !!id,
  });
}

export type ImportSkillDraftInput =
  | { kind: "markdown"; content: string }
  | { kind: "zip"; content_base64: string };

/** Parse-only preview — does not insert anything. Caller POSTs /skills itself
 *  after the user confirms (with source: 'extracted'). */
export interface SkillImportDraft {
  name: string;
  description: string;
  body: string;
}

export function useImportSkillDraft() {
  return useMutation({
    mutationFn: (input: ImportSkillDraftInput) => api.post<SkillImportDraft>("/skills/import", input),
  });
}

/** Fetches every agent's linked skills (N+1 GETs — fine for a small
 *  workspace) and returns the raw per-agent results alongside the agent list,
 *  so both usage-count and usage-list callers below share one fetch shape. */
function useAgentSkillLinksAll() {
  const { data: agents } = useAgents();
  const list = agents ?? [];
  const results = useQueries({
    queries: list.map((a) => ({
      queryKey: ["agent-skills", a.id],
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${a.id}/skills`),
    })),
  });
  return { agents: list, results };
}

/** skill id -> number of agents that currently have it linked. Used by the
 *  Skills list's card stats line ("N agents") — see the SkillsListView scope
 *  cut note for why pull/accept percentages are omitted instead. */
export function useSkillUsageCounts(): Map<string, number> {
  const { results } = useAgentSkillLinksAll();
  const counts = new Map<string, number>();
  for (const r of results) {
    for (const link of r.data ?? []) {
      counts.set(link.skill_id, (counts.get(link.skill_id) ?? 0) + 1);
    }
  }
  return counts;
}

/** Agents that currently have `skillId` linked — the Stats tab's real "Used
 *  by" list. The full A.6 pull-frequency/accept-rate/findings-by-category
 *  attribution needs a server-side trace-marker scan that wasn't built in
 *  this backend pass; that's follow-up work, not reproduced here. */
export function useAgentsUsingSkill(skillId: string | null | undefined): {
  agents: Agent[];
  isLoading: boolean;
} {
  const { agents, results } = useAgentSkillLinksAll();
  const isLoading = results.some((r) => r.isLoading);
  if (!skillId) return { agents: [], isLoading };
  const usingIds = new Set<string>();
  results.forEach((r, i) => {
    if ((r.data ?? []).some((link) => link.skill_id === skillId)) usingIds.add(agents[i]!.id);
  });
  return { agents: agents.filter((a) => usingIds.has(a.id)), isLoading };
}
