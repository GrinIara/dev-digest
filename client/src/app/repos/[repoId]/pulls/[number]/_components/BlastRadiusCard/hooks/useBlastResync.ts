/* useBlastResync — colocated UI-behaviour hook for the T8 Resync button.
   Reuses the existing repo-intel data hooks (useResyncRepoIntel/
   useRepoIntelStatus) unchanged; this hook only adds the "poll until the
   index state advances (or a max duration elapses), then refetch the blast
   radius" behaviour on top. */
"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prBlastKey } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { RESYNC_POLL_MAX_MS } from "../constants";

interface ResyncBaseline {
  updatedAt: string;
  lastIndexedSha: string;
}

export function useBlastResync(repoId: string, prId: string): { start: () => void; running: boolean } {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [polling, setPolling] = React.useState(false);
  const { data: status } = useRepoIntelStatus(repoId, polling);
  const baselineRef = React.useRef<ResyncBaseline | null>(null);
  // When `status` hasn't loaded yet at click time, there's no baseline to
  // compare against — this flag defers the baseline capture to the first
  // status the polling effect observes, instead of leaving `baselineRef`
  // permanently `null` (which would never satisfy the "advanced" check below
  // and poll for the full `RESYNC_POLL_MAX_MS` every time).
  const baselinePendingRef = React.useRef(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPollTimeout = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stop = React.useCallback(() => {
    clearPollTimeout();
    setPolling(false);
    qc.invalidateQueries({ queryKey: prBlastKey(prId) });
  }, [clearPollTimeout, qc, prId]);

  const start = React.useCallback(() => {
    if (status) {
      baselineRef.current = { updatedAt: status.updatedAt, lastIndexedSha: status.lastIndexedSha };
      baselinePendingRef.current = false;
    } else {
      baselineRef.current = null;
      baselinePendingRef.current = true;
    }
    resync.mutate();
    setPolling(true);
    clearPollTimeout();
    timeoutRef.current = setTimeout(stop, RESYNC_POLL_MAX_MS);
  }, [status, resync, stop, clearPollTimeout]);

  // Syncs with server state: once either baseline value has advanced, the
  // resync is done (or at least far enough along to show fresh data). If no
  // baseline existed at click time, the first status observed while polling
  // becomes the baseline instead — subsequent statuses are compared against
  // it. The `RESYNC_POLL_MAX_MS` timeout above remains the safety net either
  // way.
  React.useEffect(() => {
    if (!polling || !status) return;
    if (baselinePendingRef.current) {
      baselineRef.current = { updatedAt: status.updatedAt, lastIndexedSha: status.lastIndexedSha };
      baselinePendingRef.current = false;
      return;
    }
    if (!baselineRef.current) return;
    const advanced =
      status.updatedAt !== baselineRef.current.updatedAt ||
      status.lastIndexedSha !== baselineRef.current.lastIndexedSha;
    if (advanced) stop();
  }, [polling, status, stop]);

  // Cleanup on unmount — never leave a dangling timer.
  React.useEffect(() => clearPollTimeout, [clearPollTimeout]);

  return { start, running: polling };
}
