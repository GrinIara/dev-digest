"use client";

import { useTranslations } from "next-intl";
import { Drawer, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import { useContextDoc } from "@/lib/hooks";
import { DOC_TYPE_COLORS } from "../constants";
import { s } from "../styles";

export interface ContextDocDrawerProps {
  repoId: string;
  path: string;
  attached: boolean;
  /** Same attach/detach handler as the list's checkbox. */
  onToggle: (on: boolean) => void;
  onClose: () => void;
}

export function ContextDocDrawer({ repoId, path, attached, onToggle, onClose }: ContextDocDrawerProps) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDoc(repoId, path);
  const colors = data ? DOC_TYPE_COLORS[data.type] : null;

  const title = (
    <span style={s.drawerTitle}>
      <Icon.FileText size={18} aria-hidden="true" style={s.drawerTitleIcon} />
      <span style={s.drawerPath}>{path}</span>
    </span>
  );

  const subtitle = data && colors && (
    <span style={s.drawerMeta}>
      <span style={{ color: colors.color, fontWeight: 600 }}>{t(`page.typeBadge.${data.type}`)}</span>
      <span style={s.drawerMetaItem}>
        <Icon.Cpu size={14} aria-hidden="true" />
        {t("page.usedBy", { count: data.used_by })}
      </span>
      <span style={s.drawerTokens}>{t("list.footerTokens", { count: data.tokens })}</span>
    </span>
  );

  return (
    <Drawer width={640} title={title} subtitle={subtitle} onClose={onClose}>
      <button
        type="button"
        role="switch"
        aria-checked={attached}
        style={s.attachedToggle(attached)}
        onClick={() => onToggle(!attached)}
      >
        {attached ? <Icon.Check size={15} aria-hidden="true" /> : <Icon.Plus size={15} aria-hidden="true" />}
        {t("list.attached")}
      </button>
      {isLoading && <Skeleton height={120} />}
      {(isError || (!isLoading && !data)) && <ErrorState title={t("page.docLoadError")} onRetry={() => refetch()} />}
      {data && (
        <div style={s.drawerCard}>
          <Markdown variant="document">{data.content}</Markdown>
        </div>
      )}
    </Drawer>
  );
}
