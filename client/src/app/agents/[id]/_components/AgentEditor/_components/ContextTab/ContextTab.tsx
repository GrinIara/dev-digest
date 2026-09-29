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

  return (
    <div>
      <div style={s.header}>
        <div style={s.spacer} />
        <Badge>{t("list.attachedOf", { attached: attachedPaths.length, total: docs.data.docs.length })}</Badge>
      </div>
      <ContextDocList
        docs={docs.data.docs}
        attached={ctx.data.attached}
        inherited={ctx.data.inherited}
        onChange={save}
        onPreview={setPreviewPath}
        pending={setContext.isPending}
      />
      <p style={s.footer}>{t("list.footerTokens", { count: ctx.data.total_tokens })}</p>
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
