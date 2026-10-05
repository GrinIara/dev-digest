"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { formatCost, formatTokens, missingInputKey, relativeTime } from "../../helpers";
import { s } from "./styles";

export function BriefMeta({ brief, stale }: { brief: PrBrief; stale: boolean }) {
  const t = useTranslations("brief");
  const missing = brief.missing_inputs.map((m) => t(missingInputKey(m), { ref: m.ref ?? "" }));
  return (
    <>
      <div style={s.wrap}>
        <span>{t("generatedMeta", { time: relativeTime(brief.generated_at), model: brief.model })}</span>
        {brief.cost_usd != null && (
          <span>
            {formatCost(brief.cost_usd)} · {formatTokens(brief.tokens_in)}→{formatTokens(brief.tokens_out)}
          </span>
        )}
        {stale && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("outdated")}
          </Badge>
        )}
      </div>
      {missing.length > 0 && <div style={s.note}>{t("generatedWithout", { items: missing.join(", ") })}</div>}
    </>
  );
}
