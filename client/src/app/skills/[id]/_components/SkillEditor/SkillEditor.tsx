/* SkillEditor — 5-tab detail shell (Config/Preview/Versions/Stats/Evals).
   Tab state lives in ?tab= (owned by the parent SkillDetail). Preview and
   Evals are one-liners (Markdown / EvalsPanel) so they're inlined here
   rather than given their own trivial wrapper components. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { EvalsPanel } from "./_components/EvalsPanel";
import { ConfigTab } from "./_components/ConfigTab";
import { VersionsTab } from "./_components/VersionsTab";
import { StatsTab } from "./_components/StatsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* Keyed by skill.id: switching skills should reset ConfigTab's local
            form state — remount via key, same fix as AgentEditor uses. */}
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <Markdown>{skill.body}</Markdown>}
        {tab === "versions" && <VersionsTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "evals" && <EvalsPanel ownerKind="skill" ownerId={skill.id} />}
      </div>
    </div>
  );
}
