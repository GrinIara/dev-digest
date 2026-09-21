"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { SkillsShell } from "./_components/SkillsShell";

/* Route: /skills (Skills list). The skill list itself lives in SkillsShell's
   SkillsSidebar (always visible); this route only supplies the right-hand
   pane, shown when nothing is selected yet. */
export default function SkillsPage() {
  const t = useTranslations("skills");
  return (
    <SkillsShell>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EmptyState icon="ListChecks" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
      </div>
    </SkillsShell>
  );
}
