/* /skills/:id — Skill detail (Skills Lab). Header + 5-tab editor. Tab state
   lives in ?tab=. Mirrors agents/[id]/page.tsx's AgentDetailHeader/AgentEditor
   composition, but extracted into its own component so the route stays thin. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useSkill } from "@/lib/hooks/skills";
import { SkillDetailHeader } from "../SkillDetailHeader";
import { SkillEditor } from "../SkillEditor";
import { VALID_TABS } from "../SkillEditor/constants";

export function SkillDetail() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.notFound.body")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", minHeight: 0 }}>
        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <SkillDetailHeader skill={skill} onRunOnEvals={() => setTab("evals")} />
            <SkillEditor skill={skill} tab={tab} onTab={setTab} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
