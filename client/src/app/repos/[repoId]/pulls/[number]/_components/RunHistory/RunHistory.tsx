"use client";

import React from "react";
import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { tsOf } from "./helpers";
import { s } from "./styles";
import { TimelineCommitRow } from "./_components/TimelineCommitRow";
import { TimelineRunRow } from "./_components/TimelineRunRow";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 */

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

export function RunHistory({
  runs,
  commits = [],
  findingsByRunId,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** This run's findings (from the sibling Review-runs fetch, matched by run_id) —
   *  powers the severity icons + read-only hover popover. No new fetch. */
  findingsByRunId?: Map<string, FindingRecord[]>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={s.list}>
      {items.map((item) =>
        item.kind === "commit" ? (
          <TimelineCommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <TimelineRunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findings={findingsByRunId?.get(item.run.run_id) ?? []}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
