"use client";

import { useParams } from "next/navigation";
import { SkillsShell } from "../_components/SkillsShell";
import { SkillDetailContent } from "./_components/SkillDetailContent";

/* Route: /skills/:id (Skill detail). The skill list stays visible via
   SkillsShell's SkillsSidebar; this route only supplies the right-hand
   detail pane (header + tabbed editor), scoped to its own fetch/error
   state so a failed detail fetch never takes down the list. */
export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <SkillsShell activeId={id}>
      <SkillDetailContent id={id} />
    </SkillsShell>
  );
}
