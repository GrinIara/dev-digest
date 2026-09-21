/* TimelineCommitRow — a single commit marker in the PR timeline. Commits are
   markers, not actions; see RunHistory.tsx for why they're interleaved with runs. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { s } from "../../styles";

export function TimelineCommitRow({ commit }: { commit: PrCommit }) {
  return (
    <div style={s.commitRow}>
      <Icon.GitCommit size={15} style={s.commitIcon} />
      <span className="mono" style={s.commitSha}>
        {commit.sha.slice(0, 7)}
      </span>
      <span style={s.commitMessage} title={commit.message}>
        {commit.message.split("\n")[0]}
      </span>
      <span style={s.commitMeta}>{commit.author}</span>
      {commit.committed_at && <span style={s.commitMeta}>{new Date(commit.committed_at).toLocaleTimeString()}</span>}
    </div>
  );
}
