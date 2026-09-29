"use client";

import { useTranslations } from "next-intl";
import { Badge, Drawer, ErrorState, Markdown, Skeleton, Toggle } from "@devdigest/ui";
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

  const subtitle = data && colors && (
    <span style={s.drawerMeta}>
      <Badge color={colors.color} bg={colors.bg}>
        {t(`page.typeBadge.${data.type}`)}
      </Badge>
      <span>{t("page.usedBy", { count: data.used_by })}</span>
      <span>{t("list.footerTokens", { count: data.tokens })}</span>
      <label style={s.drawerToggle}>
        <Toggle on={attached} onChange={onToggle} />
        {t("list.attached")}
      </label>
    </span>
  );

  return (
    <Drawer title={path} subtitle={subtitle} onClose={onClose}>
      {isLoading && <Skeleton height={120} />}
      {(isError || (!isLoading && !data)) && <ErrorState title={t("page.docLoadError")} onRetry={() => refetch()} />}
      {data && (
        <div style={s.drawerBody}>
          <Markdown>{data.content}</Markdown>
        </div>
      )}
    </Drawer>
  );
}
