/* hooks/brief.ts — React Query hooks for the PR Brief:
     GET  /pulls/:id/brief → { brief, stale }   (stored read, no model call)
     POST /pulls/:id/brief → { brief, stale }   (one paid model call) */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PrBriefResponse } from "@devdigest/shared";
import { api } from "../api";

export const prBriefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBriefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Regenerates the brief. The brief is refreshed only on this explicit
    action (never on run finish), so `onSuccess` just writes the cache; a
    failure leaves the previous brief in the cache untouched. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (res) => qc.setQueryData(prBriefKey(prId), res),
  });
}
