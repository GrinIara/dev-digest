"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { useContextDoc } from "@/lib/hooks";
import { DOC_TYPE_COLORS } from "../../constants";
import { formatApproxTokens } from "../../helpers";
import { s } from "../../styles";
import { DocEditor } from "../DocEditor";

interface DocPreviewProps {
  repoId: string;
  path: string | null;
  onDirtyChange: (dirty: boolean) => void;
  /** Runs `proceed` now, or after the user confirms discarding unsaved edits. */
  guard: (proceed: () => void) => void;
}

/** Remount with `key={path}` so the mode resets when another doc is selected. */
export function DocPreview({ repoId, path, onDirtyChange, guard }: DocPreviewProps) {
  const t = useTranslations("context.page");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const { data, isLoading, isError, refetch } = useContextDoc(repoId, path);

  if (!path) return <p style={s.message}>{t("selectDoc")}</p>;
  if (isLoading) return <Skeleton height={120} />;
  if (isError || !data) return <ErrorState title={t("docLoadError")} onRetry={() => refetch()} />;

  const segments = data.path.split("/");
  const colors = DOC_TYPE_COLORS[data.type];

  return (
    <div>
      <nav aria-label="breadcrumb" style={s.breadcrumb}>
        <span>{t("breadcrumbRoot")}</span>
        {segments.map((seg, i) => (
          <span key={`${i}:${seg}`} style={i === segments.length - 1 ? s.breadcrumbLast : undefined}>
            / {seg}
          </span>
        ))}
      </nav>
      <div style={s.metaRow}>
        <Badge color={colors.color} bg={colors.bg}>
          {t(`typeBadge.${data.type}`)}
        </Badge>
        <span>{t("approxTokens", { count: formatApproxTokens(data.tokens) })}</span>
        <span>{t("usedBy", { count: data.used_by })}</span>
        {data.locally_modified && <span style={s.localEdit}>{t("localEdit")}</span>}
        <div role="group" aria-label={t("viewMode")} style={s.toggleGroup}>
          <button
            type="button"
            aria-pressed={mode === "preview"}
            style={s.toggleButton(mode === "preview", false)}
            onClick={() => guard(() => setMode("preview"))}
          >
            {t("preview")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "edit"}
            style={s.toggleButton(mode === "edit", false)}
            onClick={() => setMode("edit")}
          >
            {t("edit")}
          </button>
        </div>
      </div>
      {mode === "edit" ? (
        <DocEditor repoId={repoId} path={data.path} content={data.content} onDirtyChange={onDirtyChange} />
      ) : (
        <div role="region" aria-label={data.path} style={s.body}>
          <Markdown>{data.content}</Markdown>
        </div>
      )}
    </div>
  );
}
