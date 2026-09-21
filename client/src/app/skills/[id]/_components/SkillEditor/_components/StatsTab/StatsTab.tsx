/* StatsTab — "USED BY" is computed for real (GET /agents + GET
   /agents/:id/skills per agent, N+1 is fine for a small workspace). Pull
   frequency, accept rate and findings-by-category need a server-side
   trace-marker-scan attribution (spec's A.6) that wasn't built in this
   backend pass — no endpoint exists for it, so those render an honest
   "not enough data" empty state instead of fabricated numbers. The full
   A.6 attribution algorithm is follow-up work. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useAgentsUsingSkill } from "@/lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { agents, isLoading } = useAgentsUsingSkill(skill.id);

  return (
    <div style={s.wrap}>
      <section style={s.section}>
        <h3 style={s.h3}>{t("stats.usedByHeading")}</h3>
        {isLoading && <Skeleton height={40} />}
        {!isLoading && agents.length === 0 && (
          <EmptyState icon="Users" title={t("stats.usedByEmpty")} />
        )}
        {!isLoading && agents.length > 0 && (
          <div style={s.agentList}>
            {agents.map((a) => (
              <Badge key={a.id} color="var(--text-secondary)" icon="Cpu">
                {a.name}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section style={s.section}>
        <h3 style={s.h3}>{t("stats.pullFrequency")}</h3>
        <EmptyState icon="BarChart" title={t("stats.notEnoughData")} />
      </section>

      <section style={s.section}>
        <h3 style={s.h3}>{t("stats.acceptRate")}</h3>
        <EmptyState icon="Target" title={t("stats.notEnoughData")} />
      </section>

      <section style={s.section}>
        <h3 style={s.h3}>{t("stats.findingsByCategory")}</h3>
        <EmptyState icon="DollarSign" title={t("stats.notEnoughData")} />
      </section>
    </div>
  );
}
