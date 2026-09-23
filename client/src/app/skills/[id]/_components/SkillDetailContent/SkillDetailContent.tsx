/* SkillDetailContent — the right-hand pane content for /skills/:id: header +
   5-tab editor only (no AppShell/breadcrumb — that's SkillsShell's job now).
   Tab state lives in ?tab= (colocated here since this is where the fetch by
   id also lives). Loading/error states are scoped to this pane only — a
   failed fetch must not full-screen-error the whole shell, since the skill
   list on the left has to stay usable. Renamed/slimmed down from the former
   SkillDetail, which used to own its own AppShell + breadcrumb. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useSkill } from "@/lib/hooks/skills";
import { SkillDetailHeader } from "../SkillDetailHeader";
import { SkillEditor } from "../SkillEditor";
import { VALID_TABS } from "../SkillEditor/constants";

export function SkillDetailContent({ id }: { id: string }) {
  const t = useTranslations("skills");
  const search = useSearchParams();
  const router = useRouter();

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  if (isError || (!isLoading && !skill)) {
    return (
      <ErrorState
        title={t("detail.notFound.title")}
        body={error instanceof ApiError ? error.message : t("detail.notFound.body")}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !skill) {
    return (
      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  return (
    <>
      <SkillDetailHeader skill={skill} onRunOnEvals={() => setTab("evals")} />
      <SkillEditor skill={skill} tab={tab} onTab={setTab} />
    </>
  );
}
