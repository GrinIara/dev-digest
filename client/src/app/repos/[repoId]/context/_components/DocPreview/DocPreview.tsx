"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
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

  if (!path) {
    return (
      <div style={s.centered}>
        <p style={s.message}>{t("selectDoc")}</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div style={s.docScroll}>
        <Skeleton height={120} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div style={s.centered}>
        <ErrorState title={t("docLoadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const segments = data.path.split("/");
  const colors = DOC_TYPE_COLORS[data.type];

  return (
    <>
      <div style={s.docHeader}>
        <nav aria-label="breadcrumb" style={s.breadcrumb}>
          {segments.map((seg, i) => {
            const last = i === segments.length - 1;
            return (
              <span key={`${i}:${seg}`} style={last ? s.breadcrumbLast : undefined}>
                {seg}
                {!last && "/"}
              </span>
            );
          })}
        </nav>
        <div role="group" aria-label={t("viewMode")} style={s.segmented}>
          <button
            type="button"
            aria-pressed={mode === "preview"}
            style={s.segment(mode === "preview")}
            onClick={() => guard(() => setMode("preview"))}
          >
            {t("preview")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "edit"}
            style={s.segment(mode === "edit")}
            onClick={() => setMode("edit")}
          >
            {t("edit")}
          </button>
        </div>
        <div style={s.docMeta}>
          {data.locally_modified && <span style={s.headerLocalEdit}>{t("localEdit")}</span>}
          <Badge color={colors.color} bg={colors.bg}>
            {t(`typeBadge.${data.type}`)}
          </Badge>
          <span>{t("approxTokens", { count: formatApproxTokens(data.tokens) })}</span>
          <span style={s.metaItem}>
            <Icon.Cpu size={13} />
            {t("usedBy", { count: data.used_by })}
          </span>
        </div>
      </div>
      <div style={s.docScroll}>
        {mode === "edit" ? (
          <DocEditor repoId={repoId} path={data.path} content={data.content} onDirtyChange={onDirtyChange} />
        ) : (
          <div role="region" aria-label={data.path} style={s.body}>
            <Markdown variant="document">{data.content}</Markdown>
          </div>
        )}
      </div>
    </>
  );
}
