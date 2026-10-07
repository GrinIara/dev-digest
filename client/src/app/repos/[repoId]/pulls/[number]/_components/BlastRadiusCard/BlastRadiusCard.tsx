/* BlastRadiusCard — the "Blast radius" card on the PR page's Overview tab,
   next to IntentCard (R6). Container: fetches via usePrBlast and renders
   loading/error/degraded/empty/happy-path states. No fetch here — all data
   access goes through `usePrBlast` (client/AGENTS.md convention). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks/blast";
import { BlastSummary } from "./_components/BlastSummary";
import { BlastSymbolRow } from "./_components/BlastSymbolRow";
import { BlastGraph } from "./_components/BlastGraph";
import { DiscardLocalEditsDialog } from "./_components/DiscardLocalEditsDialog";
import { useBlastResync } from "./hooks/useBlastResync";
import { callerHref, kindOf } from "./helpers";
import { s } from "./styles";

type BlastView = "tree" | "graph";

interface BlastRadiusCardProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}

export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = usePrBlast(prId);
  const {
    start: startResync,
    running: resyncing,
    error: resyncError,
    noChange: resyncNoChange,
    pendingLocalEdits,
    confirmDiscard,
    cancelDiscard,
  } = useBlastResync(repoId, prId);
  // Local UI state (R11), not derived data: `null` means "no row has been
  // toggled yet" — the default (first row open, rest collapsed) is computed
  // per render from `data`, since `data` isn't available on the initial
  // (loading) render for a `useState` lazy initializer to capture. Once the
  // user toggles anything, `openSymbols` becomes the source of truth.
  const [openSymbols, setOpenSymbols] = React.useState<Set<string> | null>(null);
  // Tree | Graph toggle (R13): local UI state, default Tree.
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading) {
    return (
      <Card style={s.card}>
        <Skeleton width={140} height={14} />
        <div style={{ marginTop: 14 }}>
          <Skeleton height={12} />
          <Skeleton height={12} style={{ marginTop: 8, width: "60%" }} />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card style={s.card}>
        <ErrorState title={t("errorTitle")} body={t("errorBody")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const sha = data.indexed_sha ?? headSha;

  // Files-not-indexed-yet hint (PR #218 bug fix): only surfaced when the
  // response isn't otherwise degraded — a degraded response already carries
  // its own reason badge above. `indexed === 0` means "none of the changed
  // files are known to the index" (replaces the noDownstream text, since
  // downstream is necessarily empty in that case); `0 < indexed < changed`
  // means "some are missing" and is shown alongside whatever data exists.
  const notIndexed = !data.degraded && data.files.changed > 0 && data.files.indexed < data.files.changed;
  const missing = data.files.changed - data.files.indexed;
  const shortIndexedSha = data.indexed_sha ? data.indexed_sha.slice(0, 7) : null;
  const hasBranchInfo = !!data.indexed_branch && !!shortIndexedSha;

  return (
    <Card style={s.card}>
      <SectionLabel
        icon="Zap"
        right={
          data.degraded ? (
            <div style={s.headerActions}>
              <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
                {t("degraded.badge")} · {t(`degraded.reason.${data.reason}`)}
              </Badge>
              {/* A disabled repo-intel flag can't be fixed by resyncing. */}
              {data.reason !== "flag_off" && (
                <Button kind="secondary" size="sm" icon="RefreshCw" loading={resyncing} onClick={startResync}>
                  {resyncing ? t("resyncing") : t("resync")}
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {t("title")}
      </SectionLabel>

      {data.degraded && resyncError && (
        <div role="alert" style={s.resyncNoteError}>
          {t("resyncFailed", { message: resyncError })}
        </div>
      )}
      {data.degraded && !resyncError && resyncNoChange && (
        <div style={s.resyncNote}>{t("resyncNoChange")}</div>
      )}

      {pendingLocalEdits && (
        <DiscardLocalEditsDialog paths={pendingLocalEdits} onCancel={cancelDiscard} onConfirm={confirmDiscard} />
      )}

      <BlastSummary
        counts={data.counts}
        right={
          <div style={s.viewToggle}>
            <button
              type="button"
              aria-pressed={view === "tree"}
              onClick={() => setView("tree")}
              style={s.viewToggleButton(view === "tree")}
            >
              {t("view.tree")}
            </button>
            <button
              type="button"
              aria-pressed={view === "graph"}
              onClick={() => setView("graph")}
              style={s.viewToggleButton(view === "graph")}
            >
              {t("view.graph")}
            </button>
          </div>
        }
      />

      {data.callers_truncated && (
        <div style={s.truncatedNote}>{t("truncated", { max: data.limits.max_callers_per_symbol })}</div>
      )}

      {notIndexed && (
        <div style={s.notIndexedNote}>
          <Icon.Info size={13} style={s.notIndexedIcon} />
          <span>
            {data.files.indexed === 0
              ? hasBranchInfo
                ? t("notIndexed.none", { branch: data.indexed_branch, sha: shortIndexedSha })
                : t("notIndexed.noneNoBranch")
              : hasBranchInfo
                ? t("notIndexed.some", {
                    missing,
                    total: data.files.changed,
                    branch: data.indexed_branch,
                    sha: shortIndexedSha,
                  })
                : t("notIndexed.someNoBranch", { missing, total: data.files.changed })}
          </span>
        </div>
      )}

      {view === "graph" ? (
        <BlastGraph data={data} />
      ) : data.downstream.length === 0 ? (
        // The not-indexed hint above already explains the empty state when
        // `files.indexed === 0` — showing noDownstream too would contradict
        // it ("no downstream callers" reads as "safe" when it's really
        // "unknown").
        !(notIndexed && data.files.indexed === 0) && (
          <div style={s.emptyText}>{t("noDownstream", { count: data.counts.symbols })}</div>
        )
      ) : (
        <div style={s.symbolList}>
          {data.downstream.map((d, i) => {
            const open = openSymbols ? openSymbols.has(d.symbol) : i === 0;
            return (
              <BlastSymbolRow
                key={d.symbol}
                impact={d}
                kind={kindOf(data.changed_symbols, d.symbol)}
                hrefFor={(c) => callerHref(repoFullName, sha, c)}
                open={open}
                onToggle={() =>
                  setOpenSymbols((prev) => {
                    const base = prev ?? new Set(data.downstream[0] ? [data.downstream[0].symbol] : []);
                    const next = new Set(base);
                    if (next.has(d.symbol)) next.delete(d.symbol);
                    else next.add(d.symbol);
                    return next;
                  })
                }
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
