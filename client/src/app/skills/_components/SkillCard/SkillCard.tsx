/* SkillCard — type icon, name, enabled toggle, description, type/source/
   version badges, a "used by N agents" stats line, and a delete button.
   Mirrors AgentCard's card pattern (icon box + full-card link overlay +
   above-link toggle/delete). Delete opens the shared ConfirmModal rather
   than deleting immediately; the card itself doesn't know about routing —
   callers that need to navigate away after deleting the active card pass
   `onDeleted`. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal/ConfirmModal";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { TYPE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  /** Highlights the card as the currently-selected skill in the split view
   *  (mirrors AgentCard's `active`). */
  active,
  /** Real count of agents with this skill linked (N+1 fetch upstream — see
   *  hooks/skills.ts's useSkillUsageCounts). Pull-frequency/accept-rate need
   *  a server-side attribution pass that doesn't exist yet, so this line
   *  intentionally shows only the agent count, never fabricated percentages. */
  usedByCount,
  href,
  onToggle,
  /** Called after a confirmed delete succeeds. Routing decisions (e.g.
   *  navigating back to /skills if this was the active card) belong to the
   *  caller, not this card. */
  onDeleted,
}: {
  skill: Skill;
  active?: boolean;
  usedByCount?: number;
  href?: string;
  onToggle?: (enabled: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const TypeIcon = Icon[TYPE_ICON[skill.type]];
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);

  return (
    <div style={s.card(!!active, skill.enabled)}>
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
        <button
          onClick={() => setConfirming(true)}
          disabled={del.isPending}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={{
            ...s.aboveLink,
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        <Badge color="var(--text-muted)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        {usedByCount != null && (
          <Badge color="var(--text-secondary)" icon="Users">
            {t("listItem.usedBy", { count: usedByCount })}
          </Badge>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          title={t("card.deleteConfirm.title")}
          body={t("card.deleteConfirm.body", { name: skill.name })}
          confirmLabel={t("card.deleteConfirm.confirm")}
          pending={del.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            del.mutate(skill.id, {
              onSuccess: () => {
                setConfirming(false);
                onDeleted?.();
              },
            })
          }
        />
      )}
    </div>
  );
}
