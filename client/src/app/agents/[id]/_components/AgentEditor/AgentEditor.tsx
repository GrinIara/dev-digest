/* AgentEditor — two-tab agent editor: Config / Skills. Tab state lives in
   ?tab= (see AgentEditorPage's VALID_TABS). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* Keyed by agent.id: switching agents should reset each tab's local
            form/order state, and React's own recommended fix for "reset state
            when a prop changes" is to remount via key rather than a sync
            useEffect. */}
        {tab === "config" && <ConfigTab key={agent.id} agent={agent} />}
        {tab === "skills" && <SkillsTab key={agent.id} agent={agent} />}
      </div>
    </div>
  );
}
