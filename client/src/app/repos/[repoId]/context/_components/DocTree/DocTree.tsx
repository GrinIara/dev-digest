"use client";

import { useMemo, useState } from "react";
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
  // Folders start expanded; the set holds the ones the user collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNodes = (nodes: DocTreeNode[], nested: boolean) => (
    <ul style={nested ? s.nested : s.treeList}>
      {nodes.map((n) => {
        if (n.kind === "folder") {
          const open = !collapsed.has(n.path);
          const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
          return (
            <li key={`d:${n.path}`}>
              <button type="button" aria-expanded={open} style={s.folderButton} onClick={() => toggle(n.path)}>
                <Chevron size={12} />
                <Icon.Folder size={13} />
                <span>{n.name}/</span>
              </button>
              {open && renderNodes(n.children, true)}
            </li>
          );
        }
        const active = n.doc.path === selectedPath;
        return (
          <li key={`f:${n.doc.path}`}>
            <button
              type="button"
              aria-label={n.doc.path}
              aria-current={active ? "true" : undefined}
              title={`${n.doc.path} · ${t(`typeBadge.${n.doc.type}`)}`}
              style={s.fileButton(active)}
              onClick={() => onSelect(n.doc.path)}
            >
              <span style={s.fileLine}>
                <Icon.FileText size={14} style={s.fileIcon(active)} />
                <span style={s.fileName}>{n.name}</span>
                <span style={s.fileTokens}>{formatApproxTokens(n.doc.tokens)}</span>
              </span>
              {n.doc.locally_modified && <span style={s.rowLocalEdit}>{t("localEdit")}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return <nav aria-label={t("treeLabel")}>{renderNodes(tree, false)}</nav>;
}
