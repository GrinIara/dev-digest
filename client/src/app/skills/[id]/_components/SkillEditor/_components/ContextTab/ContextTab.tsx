/* ContextTab — skill "Context" tab: docs every agent using this skill inherits. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocList, ContextDocDrawer, isNotClonedError } from "@/components/project-context";
import { groupForSerialization, togglePath } from "@/components/project-context/helpers";
import { useContextDocs, useSetSkillContext, useSkillContext } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const docs = useContextDocs(repoId);
  const ctx = useSkillContext(skill.id, repoId);
  const setContext = useSetSkillContext(skill.id, repoId);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (!repoId) return <p style={s.message}>{t("drawer.selectRepo")}</p>;

  const notCloned = isNotClonedError(docs.error) || isNotClonedError(ctx.error);
  if (docs.isLoading || ctx.isLoading) return <Skeleton height={160} />;
  if (notCloned) return <p style={s.message}>{t("page.notCloned")}</p>;
  if (docs.error || ctx.error || !docs.data || !ctx.data) {
    return (
      <ErrorState
        title={t("page.loadError")}
        onRetry={() => {
          docs.refetch();
          ctx.refetch();
        }}
      />
    );
  }

  const attachedPaths = ctx.data.attached.map((r) => r.path);
  const groups = groupForSerialization(ctx.data.attached);
  const save = (paths: string[]) =>
    setContext.mutate(paths, { onError: () => toast.error(t("list.updateError")) });

  return (
    <div>
      <div style={s.header}>
        <div>
          <h3 style={s.heading}>{t("drawer.skillHeading")}</h3>
          <p style={s.subtitle}>{t("drawer.skillSubtitle")}</p>
        </div>
        <div style={s.spacer} />
        <Badge>{t("list.attachedCount", { count: attachedPaths.length })}</Badge>
      </div>
      <ContextDocList
        docs={docs.data.docs}
        attached={ctx.data.attached}
        onChange={save}
        onPreview={setPreviewPath}
        pending={setContext.isPending}
      />
      <p style={s.footer}>{t("list.footerTokens", { count: ctx.data.total_tokens })}</p>
      {groups.length > 0 && (
        <section aria-label={t("drawer.serializesAs")} style={s.serializes}>
          <div style={s.serializesLabel}>{t("drawer.serializesAs")}</div>
          {groups.map((g) => (
            <div key={g.type}>
              <h4 style={s.groupHeading}>{t(`drawer.group.${g.type}`)}</h4>
              <ul style={s.groupList}>
                {g.paths.map((p) => (
                  <li key={p} className="mono">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {previewPath && (
        <ContextDocDrawer
          repoId={repoId}
          path={previewPath}
          attached={attachedPaths.includes(previewPath)}
          onToggle={(on) => save(togglePath(attachedPaths, previewPath, on))}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
