/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Icon,
  Avatar,
  Badge,
  CircularScore,
  SeverityBadge,
  FindingsHoverPopover,
  type FindingPreview,
} from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { SIZE_COLOR, STATUS_META, SEVERITIES } from "../../constants";
import { formatCost, relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
        {pr.findings && SEVERITIES.some((sev) => (pr.findings![sev] ?? 0) > 0) ? (
          <FindingsHoverPopover
            title={t("list.findingsPopoverTitle", { count: pr.latest_findings?.length ?? 0 })}
            findings={(pr.latest_findings ?? []).map(
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
              <div style={{ display: "flex", gap: 6 }}>
                {SEVERITIES.filter((sev) => (pr.findings![sev] ?? 0) > 0).map((sev) => (
                  <SeverityBadge key={sev} severity={sev} count={pr.findings![sev] ?? 0} compact />
                ))}
              </div>
            }
          />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.updatedCell}>{formatCost(pr.cost_usd)}</div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
