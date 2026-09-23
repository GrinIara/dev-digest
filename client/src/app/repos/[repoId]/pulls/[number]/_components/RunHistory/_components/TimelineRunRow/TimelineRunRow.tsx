/* TimelineRunRow — a single agent-run tile in the PR timeline. See
   RunHistory.tsx for the outcome-badge contract this row renders. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore, SeverityBadge, FindingsHoverPopover, type FindingPreview } from "@devdigest/ui";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import { formatCost } from "../../../../../helpers";
import { SEVERITIES, outcomeOf, tallyBySeverity } from "../../helpers";
import { s } from "../../styles";

export function TimelineRunRow({
  run,
  findings,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  findings: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(run);
  const settled = run.status === "done";
  const severityCounts = tallyBySeverity(findings);

  return (
    <div style={s.row}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && run.score != null && <CircularScore score={run.score} size={30} stroke={3} />}
      <div style={s.mainCol}>
        <div style={s.nameRow}>
          <button
            type="button"
            onClick={() => onGoToReview?.(run.run_id)}
            title={t("timeline.goToReview")}
            style={s.agentNameButton(!!onGoToReview)}
          >
            {run.agent_name ?? "Agent"}
          </button>{" "}
          <span className="mono" style={s.providerModel}>
            {run.provider}/{run.model}
          </span>
        </div>
        {run.status === "failed" && run.error && (
          <div style={s.errorText} title={run.error}>
            {run.error}
          </div>
        )}
        {settled && (
          <div style={s.findingsRow}>
            {findings.length > 0 ? (
              <FindingsHoverPopover
                title={t("timeline.findingsInRun", { count: findings.length })}
                findings={findings.map(
                  (f): FindingPreview => ({
                    severity: f.severity,
                    title: f.title,
                    category: f.category,
                    file: f.file,
                    start_line: f.start_line,
                    confidence: f.confidence,
                    rationale: f.rationale,
                  }),
                )}
                trigger={
                  <div style={s.severityBadges}>
                    {SEVERITIES.filter((sev) => severityCounts[sev] > 0).map((sev) => (
                      <SeverityBadge key={sev} severity={sev} count={severityCounts[sev]} compact />
                    ))}
                  </div>
                }
              />
            ) : (
              <span>{t("runStatus.findings", { count: run.findings_count ?? 0 })}</span>
            )}
            {(run.blockers ?? 0) > 0 && <span>{t("runStatus.blockers", { count: run.blockers ?? 0 })}</span>}
          </div>
        )}
      </div>
      <div style={s.metaCol}>
        {settled && run.tokens_in != null && run.tokens_out != null && (
          <span>
            {run.cost_usd != null
              ? t("timeline.usageWithCost", {
                  tokens: (run.tokens_in + run.tokens_out).toLocaleString(),
                  cost: formatCost(run.cost_usd),
                })
              : t("timeline.usage", { tokens: (run.tokens_in + run.tokens_out).toLocaleString() })}
          </span>
        )}
        {run.ran_at && <span>{new Date(run.ran_at).toLocaleTimeString()}</span>}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(run.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && run.status !== "running" && (
        <button
          type="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(run.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} />
        </button>
      )}
    </div>
  );
}
