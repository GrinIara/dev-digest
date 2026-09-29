/* hooks/blast.ts — React Query hook for the blast-radius read model:
     GET /pulls/:id/blast → BlastRadiusResponse (read-only, no reparse). */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { api } from "../api";

/** Query key factory for the blast-radius read model — shared with
    `useBlastResync`'s invalidation so both never drift out of sync. */
export const prBlastKey = (prId: string | null | undefined) => ["pr-blast", prId] as const;

/** GET /pulls/:id/blast → the PR's blast radius (symbols, callers, endpoints/crons). */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBlastKey(prId),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
