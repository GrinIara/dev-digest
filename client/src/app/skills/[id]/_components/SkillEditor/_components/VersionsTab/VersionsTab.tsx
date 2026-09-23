/* VersionsTab — version history newest-first, with a self-contained Diff
   modal (diffBodies via the `diff` package, not the PR DiffViewer — see
   helpers.ts) and a Restore action that PATCHes the old body back in,
   creating a new version rather than mutating history. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton, EmptyState, Badge, Modal } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { diffBodies } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [diffTarget, setDiffTarget] = React.useState<SkillVersion | null>(null);

  const restore = (v: SkillVersion) =>
    update.mutate(
      { id: skill.id, patch: { body: v.body, change_summary: t("versions.restoredSummary", { version: v.version }) } },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

  if (isLoading) return <Skeleton height={120} />;
  if (!versions || versions.length === 0) {
    return <EmptyState icon="History" title={t("versions.empty")} />;
  }

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.heading")}</h2>
      {versions.map((v) => {
        const isCurrent = v.version === skill.version;
        return (
          <div key={v.version} style={s.row}>
            <span className="mono" style={s.versionTag}>
              v{v.version}
            </span>
            <span style={s.summary}>{v.change_summary || t("versions.noSummary")}</span>
            <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
            {isCurrent ? (
              <Badge color="var(--text-secondary)">{t("versions.current")}</Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="secondary" size="sm" onClick={() => setDiffTarget(v)}>
                  {t("versions.diff")}
                </Button>
                <Button kind="secondary" size="sm" disabled={update.isPending} onClick={() => restore(v)}>
                  {t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffTarget && (
        <Modal
          title={t("versions.diffModalTitle", { from: diffTarget.version, to: skill.version })}
          onClose={() => setDiffTarget(null)}
          width={720}
        >
          <div style={s.diffBody}>
            {diffBodies(diffTarget.body, skill.body).map((part, i) => (
              <div key={i} style={s.diffLine(part.type)}>
                {part.type === "add" ? "+ " : part.type === "remove" ? "- " : "  "}
                {part.value}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
