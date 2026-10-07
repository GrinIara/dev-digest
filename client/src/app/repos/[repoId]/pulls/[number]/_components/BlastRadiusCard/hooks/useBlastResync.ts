/* useBlastResync — colocated UI-behaviour hook for the T8 Resync button.
   Reuses the existing repo-intel data hooks (useResyncRepoIntel/
   useRepoIntelStatus) unchanged; this hook adds the "poll until the index
   state advances (or a max duration elapses), then refetch the blast radius"
   behaviour on top, plus two failure signals the naive poll didn't surface:
     - `error`   — the POST /repos/:id/resync request itself failed (e.g. the
                   404/409 the server now returns instead of silently
                   enqueueing a job that degrades and persists nothing);
     - `noChange` — the request was accepted, but nothing was observably
                    different by RESYNC_POLL_MAX_MS (the index still didn't
                    advance) — distinct from a plain error so the UI can say
                    "no change" instead of implying the request failed. */
"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LOCAL_EDITS_CODE, LocalEditsConflictDetails } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { prBlastKey } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { RESYNC_POLL_MAX_MS } from "../constants";

interface ResyncBaseline {
  updatedAt: string;
  lastIndexedSha: string;
}

interface UseBlastResyncResult {
  start: () => void;
  running: boolean;
  /** Message from the failed POST /repos/:id/resync, or null. Cleared on the next `start()`. */
  error: string | null;
  /** True once RESYNC_POLL_MAX_MS elapsed with no observed index progress. Cleared on the next `start()`. */
  noChange: boolean;
  /** Paths with uncommitted local edits the server refused to discard (409 `local_edits`), or null. */
  pendingLocalEdits: string[] | null;
  /** Clears the pending conflict and restarts the resync with `discard_local_edits=true`. */
  confirmDiscard: () => void;
  /** Clears the pending conflict without a second request. */
  cancelDiscard: () => void;
}

export function useBlastResync(repoId: string, prId: string): UseBlastResyncResult {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [polling, setPolling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [noChange, setNoChange] = React.useState(false);
  const [pendingLocalEdits, setPendingLocalEdits] = React.useState<string[] | null>(null);
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

  // The resync actually advanced the index — stop polling and refetch the blast map.
  const stop = React.useCallback(() => {
    clearPollTimeout();
    setPolling(false);
    qc.invalidateQueries({ queryKey: prBlastKey(prId) });
  }, [clearPollTimeout, qc, prId]);

  // RESYNC_POLL_MAX_MS elapsed with no observed progress — stop polling without
  // pretending anything changed (no query invalidation: refetching the same
  // blast data would just be wasted work).
  const giveUp = React.useCallback(() => {
    clearPollTimeout();
    setPolling(false);
    setNoChange(true);
  }, [clearPollTimeout]);

  const run = React.useCallback(
    (discardLocalEdits: boolean) => {
      setError(null);
      setNoChange(false);
      if (status) {
        baselineRef.current = {
          updatedAt: status.updatedAt,
          lastIndexedSha: status.lastIndexedSha,
        };
        baselinePendingRef.current = false;
      } else {
        baselineRef.current = null;
        baselinePendingRef.current = true;
      }
      // Set `polling`/the timeout BEFORE calling `mutate` (not after) so that
      // however soon `onError` fires — TanStack Query always calls it
      // asynchronously in real usage, but nothing here should depend on that —
      // its `setPolling(false)` is guaranteed to be the last write, not one
      // `setPolling(true)` immediately clobbers.
      setPolling(true);
      clearPollTimeout();
      timeoutRef.current = setTimeout(giveUp, RESYNC_POLL_MAX_MS);
      resync.mutate(discardLocalEdits ? { discardLocalEdits: true } : undefined, {
        // The POST itself failed (404 unknown repo, 409 not cloned yet, network
        // error, …) — stop polling immediately instead of waiting out the full
        // RESYNC_POLL_MAX_MS for a job that was never even enqueued.
        onError: (err) => {
          clearPollTimeout();
          setPolling(false);
          if (err instanceof ApiError && err.status === 409 && err.code === LOCAL_EDITS_CODE) {
            const parsed = LocalEditsConflictDetails.safeParse(err.details);
            if (parsed.success) {
              setPendingLocalEdits(parsed.data.paths);
              return;
            }
          }
          setError(err instanceof ApiError ? err.message : "Resync failed.");
        },
      });
    },
    [status, resync, clearPollTimeout, giveUp],
  );

  const start = React.useCallback(() => run(false), [run]);

  const confirmDiscard = React.useCallback(() => {
    setPendingLocalEdits(null);
    run(true);
  }, [run]);

  const cancelDiscard = React.useCallback(() => setPendingLocalEdits(null), []);

  // Syncs with server state: once either baseline value has advanced, the
  // resync is done (or at least far enough along to show fresh data). If no
  // baseline existed at click time, the first status observed while polling
  // becomes the baseline instead — subsequent statuses are compared against
  // it. The `RESYNC_POLL_MAX_MS` timeout above remains the safety net either
  // way.
  React.useEffect(() => {
    if (!polling || !status) return;
    if (baselinePendingRef.current) {
      baselineRef.current = {
        updatedAt: status.updatedAt,
        lastIndexedSha: status.lastIndexedSha,
      };
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

  return {
    start,
    running: polling,
    error,
    noChange,
    pendingLocalEdits,
    confirmDiscard,
    cancelDiscard,
  };
}
