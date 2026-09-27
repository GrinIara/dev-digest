/* BlastSummary — the top stat row (R6): <> N symbols, ↳ N callers, 🌐 N
   endpoints, 🕒 N cron/jobs. Every count comes from `counts`, every label
   from blast.json — no client component hardcodes the repo-intel limits.

   `right` (T9 deviation — see BlastRadiusCard T9 report) hosts the
   Tree | Graph segmented toggle on the right side of this same row, per the
   target design ("summary row: stats on the left, toggle on the right"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

interface BlastSummaryProps {
  counts: { symbols: number; callers: number; endpoints: number; crons: number };
  right?: React.ReactNode;
}

function Stat({ icon, count, label }: { icon: IconName; count: number; label: string }) {
  const I = Icon[icon];
  return (
    <span style={s.stat}>
      <I size={13} style={s.statIcon} />
      <span className="tnum">
        {count} {label}
      </span>
    </span>
  );
}

export function BlastSummary({ counts, right }: BlastSummaryProps) {
  const t = useTranslations("blast");
  return (
    <div style={s.row}>
      <div style={s.stats}>
        <Stat icon="Code" count={counts.symbols} label={t("stat.symbols")} />
        <Stat icon="CornerDownRight" count={counts.callers} label={t("stat.callers")} />
        <Stat icon="Globe" count={counts.endpoints} label={t("stat.endpoints")} />
        <Stat icon="Clock" count={counts.crons} label={t("stat.crons")} />
      </div>
      {right}
    </div>
  );
}
