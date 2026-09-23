/* SkillsShell — the persistent master-detail layout shared by /skills and
   /skills/:id: AppShell (Skills Lab › Skills crumb) wrapping a flex row of
   SkillsSidebar (the skill list, always visible) + a right-hand detail pane
   passed in via `children`. This replaces the chrome that used to live in
   the now-removed SkillsListView, so both routes get the same list instead
   of the detail page navigating to a fully separate, list-less screen. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkillUsageCounts, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillsSidebar } from "../SkillsSidebar";
import { s } from "./styles";

export function SkillsShell({
  activeId,
  children,
}: {
  /** The currently-selected skill id, or undefined on /skills with nothing
   *  selected. */
  activeId?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const usageCounts = useSkillUsageCounts();

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.row}>
        <SkillsSidebar
          skills={skills}
          activeId={activeId}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          usageCounts={usageCounts}
          onToggleSkill={(id, enabled) => update.mutate({ id, patch: { enabled } })}
        />
        <div style={s.detail}>{children}</div>
      </div>
    </AppShell>
  );
}
