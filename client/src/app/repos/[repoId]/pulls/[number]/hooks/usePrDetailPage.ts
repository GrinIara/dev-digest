/* usePrDetailPage — all data-fetching and derived-data logic for the PR
   Detail page (/repos/:repoId/pulls/:number), so page.tsx stays a thin
   composition of tab components. Tab/trace state lives in the URL (?tab,
   ?trace), same mechanism as every other list/detail page in this app. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import { usePullDetail, usePulls } from "../../../../../../lib/hooks";
import {
  usePrReviews,
  useCancelRun,
  usePrActiveRuns,
  usePrRuns,
  useDeleteRun,
} from "../../../../../../lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "../../../../../../lib/repo-context";
import { githubPrUrl } from "../../../../../../lib/github-urls";

export function usePrDetailPage() {
  const params = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { repoId, number } = params;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const isLoading = pullsLoading || (prId != null && detailLoading);

  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun();
  const invalidateActiveRuns = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
  };
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  // Also refresh the Intent card: a run's first pass through executeRuns may
  // have derived + persisted a PR's intent for the first time. Also refresh
  // Smart Diff: a finished run changes the latest-per-agent findings behind
  // the Smart Diff indicators (the `● N` counters and file dots).
  const invalidateRunHistory = () => {
    if (prId) {
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-intent", prId] });
      qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
    }
  };

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };
  const setTab = (t: string) => setParam("tab", t);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = React.useMemo(() => reviews ?? [], [reviews]);
  const allFindings: FindingRecord[] = React.useMemo(() => runs.flatMap((r) => r.findings), [runs]);
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");
  const findingsCount = allFindings.length;
  // The run whose trace drawer is open (?trace=<runId>), if any.
  const traceReview = runs.find((r) => r.run_id === traceRunId);

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const githubUrl = repoFullName && pr ? githubPrUrl(repoFullName, pr.number) : null;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  return {
    repoId,
    number,
    repoNotFound,
    crumb,
    pr,
    isLoading,
    isError,
    error,
    refetch,
    prId,
    runs,
    findingsCount,
    lethalTrifecta,
    liveRunIds,
    reviewRunning,
    cancel,
    deleteRun,
    invalidateActiveRuns,
    invalidateRunHistory,
    refetchReviews,
    prRuns,
    tab,
    traceRunId,
    traceReview,
    setParam,
    setTab,
    repoFullName,
    githubUrl,
  };
}
