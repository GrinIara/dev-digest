/* SkillDetailHeader — name/type/version row above the tabs, plus the
   "Run on evals" shortcut (jumps to the Evals tab; running stays per-case,
   driven by EvalsPanel itself — see the SkillEditor Evals tab). Mirrors
   AgentDetailHeader's structure. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Badge, type IconName } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";

/** Colocated rather than shared with SkillCard's constants — mirrors how
 *  AgentDetailHeader picks its own icon directly instead of importing from
 *  AgentCard (no established cross-route-segment reuse precedent here yet). */
const TYPE_ICON: Record<SkillType, IconName> = {
  rubric: "ListChecks",
  convention: "FileText",
  security: "Shield",
  custom: "Wrench",
};

export function SkillDetailHeader({ skill, onRunOnEvals }: { skill: Skill; onRunOnEvals: () => void }) {
  const t = useTranslations("skills");
  const TypeIcon = Icon[TYPE_ICON[skill.type]];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
      <TypeIcon size={18} style={{ color: "var(--accent)" }} />
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
      <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
      <Badge color="var(--text-secondary)" mono>
        {t("preview.version", { version: skill.version })}
      </Badge>
      {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
      <div style={{ marginLeft: "auto" }}>
        <Button kind="secondary" size="sm" icon="FlaskConical" onClick={onRunOnEvals}>
          {t("detail.runOnEvals")}
        </Button>
      </div>
    </div>
  );
}
