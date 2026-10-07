/* ContextTab — agent "Context" tab: attach repo docs to this agent for the active repo. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocList, ContextDocDrawer, isNotClonedError } from "@/components/project-context";
import { togglePath } from "@/components/project-context/helpers";
import { useAgentContext, useContextDocs, useSetAgentContext } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const docs = useContextDocs(repoId);
  const ctx = useAgentContext(agent.id, repoId);
  const setContext = useSetAgentContext(agent.id, repoId);
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
  const save = (paths: string[]) =>
    setContext.mutate(paths, { onError: () => toast.error(t("list.updateError")) });

  const code = (chunks: React.ReactNode) => <code style={s.code}>{chunks}</code>;

  return (
    <div style={s.wrap}>
      <ContextDocList
        title={
          <>
            <h3 style={s.heading}>{t("list.agentHeading")}</h3>
            <Badge color="var(--accent-text)" bg="var(--accent-bg)">
              {t("list.attachedOf", { attached: attachedPaths.length, total: docs.data.docs.length })}
            </Badge>
          </>
        }
        subtitle={t.rich("list.agentSubtitle", { code })}
        docs={docs.data.docs}
        attached={ctx.data.attached}
        inherited={ctx.data.inherited}
        onChange={save}
        onPreview={setPreviewPath}
        pending={setContext.isPending}
      />
      <div style={s.footer}>
        <span style={s.footerTokens}>{t("list.footerTokens", { count: ctx.data.total_tokens })}</span>
        <span style={s.footerNote}>{t.rich("list.injectedNote", { code })}</span>
      </div>
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
