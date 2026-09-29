"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextDoc } from "@/lib/types";
import { buildDocTree, formatApproxTokens, type DocTreeNode } from "../../helpers";
import { s } from "../../styles";

export function DocTree({
  docs,
  selectedPath,
  onSelect,
}: {
  docs: ContextDoc[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context.page");
  const tree = useMemo(() => buildDocTree(docs), [docs]);

  const renderNodes = (nodes: DocTreeNode[], nested: boolean) => (
    <ul style={nested ? s.nested : s.treeList}>
      {nodes.map((n) =>
        n.kind === "folder" ? (
          <li key={`d:${n.path}`}>
            <div style={s.folderRow}>
              <Icon.Folder size={13} />
              <span>{n.name}/</span>
            </div>
            {renderNodes(n.children, true)}
          </li>
        ) : (
          <li key={`f:${n.doc.path}`}>
            <button
              type="button"
              aria-label={n.doc.path}
              aria-current={n.doc.path === selectedPath ? "true" : undefined}
              style={s.fileButton(n.doc.path === selectedPath)}
              onClick={() => onSelect(n.doc.path)}
            >
              <span>{n.name}</span>
              <span style={s.fileMeta}>
                {t(`typeBadge.${n.doc.type}`)} ·{" "}
                {t("approxTokens", { count: formatApproxTokens(n.doc.tokens) })}
              </span>
              {n.doc.locally_modified && <span style={s.localEdit}>{t("localEdit")}</span>}
            </button>
          </li>
        ),
      )}
    </ul>
  );

  return <nav aria-label={t("treeLabel")}>{renderNodes(tree, false)}</nav>;
}
