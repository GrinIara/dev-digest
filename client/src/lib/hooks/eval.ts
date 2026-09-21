/* hooks/eval.ts — React Query hooks for the owner-agnostic Evals tab (Skill
   detail + Agent detail share this: owner_kind 'skill' | 'agent'). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCase, EvalCaseRun, EvalOwnerKind } from "@devdigest/shared";

export function useEvalCases(ownerKind: EvalOwnerKind, ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", ownerKind, ownerId],
    queryFn: () =>
      api.get<EvalCase[]>(
        `/eval-cases?${new URLSearchParams({ owner_kind: ownerKind, owner_id: ownerId! }).toString()}`
      ),
    enabled: !!ownerId,
  });
}

export function useEvalCaseRuns(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case-runs", caseId],
    queryFn: () => api.get<EvalCaseRun[]>(`/eval-cases/${caseId}/runs`),
    enabled: !!caseId,
  });
}

export interface CreateEvalCaseInput {
  owner_kind: EvalOwnerKind;
  owner_id: string;
  name: string;
  input_diff: string;
  expected_output?: unknown;
  notes?: string;
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEvalCaseInput) => api.post<EvalCase>("/eval-cases", input),
    onSuccess: (data) =>
      qc.invalidateQueries({ queryKey: ["eval-cases", data.owner_kind, data.owner_id] }),
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases"] }),
  });
}

export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalCaseRun>(`/eval-cases/${caseId}/run`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["eval-case-runs", data.case_id] });
      qc.invalidateQueries({ queryKey: ["eval-cases"] });
    },
  });
}
