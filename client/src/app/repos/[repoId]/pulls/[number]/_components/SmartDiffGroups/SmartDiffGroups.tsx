"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { FileCard, type DiffCommentApi, type FileCardProps } from "@/components/diff-viewer";
import type { ResolvedGroup } from "../DiffTab/helpers";
import { ROLE_COLOR, ROLE_LABEL_KEY, ROLE_HINT_KEY, DEFAULT_COLLAPSED } from "./constants";
import { s, chevronFor } from "./styles";

interface SmartDiffGroupsProps {
  groups: ResolvedGroup[];
  commenting?: DiffCommentApi;
  fileProps: (f: PrFile) => Omit<Partial<FileCardProps>, "file" | "commenting">;
}

/** One collapsible role-section header: chevron, role square, label, hint,
   and the `● N` findings-count + files-count on the right. */
function GroupHeader({
  group,
  expanded,
  onToggle,
  t,
}: {
  group: ResolvedGroup;
  expanded: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onToggle} style={s.header}>
      <Icon.ChevronRight size={13} style={chevronFor(expanded)} />
      <span style={{ ...s.roleSquare, background: ROLE_COLOR[group.role] }} />
      <span style={s.roleLabel}>{t(ROLE_LABEL_KEY[group.role])}</span>
      <span style={s.roleHint}>{t(ROLE_HINT_KEY[group.role])}</span>
      <span style={s.headerRight}>
        {group.withFindings > 0 && (
          <span
            aria-label={t("smartDiff.filesWithFindings", { count: group.withFindings })}
            style={{ color: SEV.CRITICAL.c }}
          >
            ● {group.withFindings}
          </span>
        )}
        {t("smartDiff.filesCount", { count: group.files.length })}
      </span>
    </button>
  );
}

export function SmartDiffGroups({ groups, commenting, fileProps }: SmartDiffGroupsProps) {
  const t = useTranslations("prReview");
  const [collapsed, setCollapsed] = React.useState<Set<SmartDiffRole>>(
    () => new Set(DEFAULT_COLLAPSED),
  );

  const toggle = (role: SmartDiffRole) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  return (
    <div style={s.list}>
      {groups.map((g) => {
        const expanded = !collapsed.has(g.role);
        return (
          <div key={g.role} style={s.group}>
            <GroupHeader group={g} expanded={expanded} onToggle={() => toggle(g.role)} t={t} />
            {expanded && (
              <div style={s.files}>
                {g.files.map((f) => (
                  <FileCard key={f.path} file={f} commenting={commenting} {...fileProps(f)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
