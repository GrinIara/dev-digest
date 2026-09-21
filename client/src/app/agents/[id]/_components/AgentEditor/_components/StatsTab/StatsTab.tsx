"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { s } from "./styles";

/**
 * Stats tab — an aggregate run/accept/cost line + a small detail view, sourced
 * from agent-level `agent_runs` + `findings` aggregates. No hook or endpoint in
 * `lib/hooks/*` currently computes this (the only run-history hooks —
 * `usePrRuns`/`usePrActiveRuns` in `lib/hooks/reviews.ts` — are PR-scoped, not
 * agent-scoped, and carry no accept/dismiss or cost aggregation). Rather than
 * add a new backend route for this pass, this renders an honest "not enough
 * data" state — see the AgentEditor task report for the flagged gap.
 */
export function StatsTab({ agent: _agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("stats.title")}</h2>
      <EmptyState icon="BarChart" title={t("stats.emptyTitle")} body={t("stats.emptyBody")} />
    </div>
  );
}
