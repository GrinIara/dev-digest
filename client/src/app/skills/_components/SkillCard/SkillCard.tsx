/* SkillCard — type icon, name, enabled toggle, description, type/source
   badges, and a "used by N agents" stats line. Mirrors AgentCard's card
   pattern (icon box + full-card link overlay + above-link toggle). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TYPE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  /** Real count of agents with this skill linked (N+1 fetch upstream — see
   *  hooks/skills.ts's useSkillUsageCounts). Pull-frequency/accept-rate need
   *  a server-side attribution pass that doesn't exist yet, so this line
   *  intentionally shows only the agent count, never fabricated percentages. */
  usedByCount,
  href,
  onToggle,
}: {
  skill: Skill;
  usedByCount?: number;
  href?: string;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const TypeIcon = Icon[TYPE_ICON[skill.type]];
  return (
    <div style={s.card(skill.enabled)}>
      {href && <Link href={href} aria-label={skill.name} style={s.cardLink} />}
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <TypeIcon size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div style={s.aboveLink}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        {usedByCount != null && (
          <Badge color="var(--text-secondary)" icon="Users">
            {t("listItem.usedBy", { count: usedByCount })}
          </Badge>
        )}
      </div>
    </div>
  );
}
