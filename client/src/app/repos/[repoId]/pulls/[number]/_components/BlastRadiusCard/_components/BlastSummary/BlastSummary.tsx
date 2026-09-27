/* BlastSummary — the top stat row (R6): <> N symbols, ↳ N callers, 🌐 N
   endpoints, 🕒 N cron/jobs. Every count comes from `counts`, every label
   from blast.json — no client component hardcodes the repo-intel limits. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

interface BlastSummaryProps {
  counts: { symbols: number; callers: number; endpoints: number; crons: number };
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

export function BlastSummary({ counts }: BlastSummaryProps) {
  const t = useTranslations("blast");
  return (
    <div style={s.row}>
      <Stat icon="Code" count={counts.symbols} label={t("stat.symbols")} />
      <Stat icon="CornerDownRight" count={counts.callers} label={t("stat.callers")} />
      <Stat icon="Globe" count={counts.endpoints} label={t("stat.endpoints")} />
      <Stat icon="Clock" count={counts.crons} label={t("stat.crons")} />
    </div>
  );
}
