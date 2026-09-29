"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { ContextAttachedRow, ContextDoc, ContextDocType, ContextInheritedRow } from "@/lib/types";
import { DOC_TYPE_COLORS } from "../constants";
import { filterByPath, moveItem, splitPath, togglePath } from "../helpers";
import { s } from "../styles";

export interface ContextDocListProps {
  docs: ContextDoc[];
  attached: ContextAttachedRow[];
  inherited?: ContextInheritedRow[];
  /** Called with the full new ordered set of attached paths. */
  onChange: (paths: string[]) => void;
  onPreview: (path: string) => void;
  /** A save is in flight; the list stays interactive (disabling would drop keyboard focus). */
  pending: boolean;
  /** Heading + count badge, shown left of the filter. */
  title?: React.ReactNode;
  /** One line under the heading row. */
  subtitle?: React.ReactNode;
}

interface Row {
  key: string;
  path: string;
  type: ContextDocType | null;
  tokens: number | null;
  missing: boolean;
  kind: "attached" | "inherited" | "available";
  skillName?: string;
}

export function ContextDocList({
  docs,
  attached,
  inherited = [],
  onChange,
  onPreview,
  pending,
  title,
  subtitle,
}: ContextDocListProps) {
  const t = useTranslations("context");
  const [query, setQuery] = useState("");
  const [dragPath, setDragPath] = useState<string | null>(null);
  // Row whose reorder controls are shown (hover or keyboard focus inside it).
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const attachedPaths = useMemo(() => attached.map((r) => r.path), [attached]);

  const rows = useMemo<Row[]>(() => {
    const attachedSet = new Set(attachedPaths);
    const docByPath = new Map(docs.map((d) => [d.path, d]));
    const out: Row[] = attached.map((r) => ({
      key: `a:${r.path}`,
      path: r.path,
      type: r.type ?? docByPath.get(r.path)?.type ?? null,
      tokens: r.tokens,
      missing: r.status === "missing",
      kind: "attached",
    }));
    for (const r of inherited) {
      out.push({
        key: `i:${r.skill_id}:${r.path}`,
        path: r.path,
        type: r.type,
        tokens: r.tokens,
        missing: r.status === "missing",
        kind: "inherited",
        skillName: r.skill_name,
      });
    }
    for (const d of docs) {
      if (attachedSet.has(d.path)) continue;
      out.push({ key: `d:${d.path}`, path: d.path, type: d.type, tokens: d.tokens, missing: false, kind: "available" });
    }
    return out;
  }, [docs, attached, attachedPaths, inherited]);

  const visible = filterByPath(rows, query);

  const drop = (targetPath: string) => {
    if (dragPath && dragPath !== targetPath) {
      onChange(moveItem(attachedPaths, attachedPaths.indexOf(dragPath), attachedPaths.indexOf(targetPath)));
    }
    setDragPath(null);
  };

  return (
    <div aria-busy={pending}>
      <div style={s.topRow}>
        <div style={s.titleGroup}>{title}</div>
        <div style={s.filterWrap}>
          <Icon.Search size={14} style={s.filterIcon} />
          <input
            type="text"
            role="textbox"
            aria-label={t("list.filterPlaceholder")}
            placeholder={t("list.filterPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={s.filterInput}
          />
        </div>
      </div>
      {subtitle && <p style={s.subtitle}>{subtitle}</p>}
      {visible.length === 0 ? (
        <p style={s.message}>{t("list.noMatch")}</p>
      ) : (
        <ul style={s.list}>
          {visible.map((row) => {
            const { dir, name } = splitPath(row.path);
            const isAttached = row.kind === "attached";
            const index = isAttached ? attachedPaths.indexOf(row.path) : -1;
            const colors = row.type ? DOC_TYPE_COLORS[row.type] : null;
            return (
              <li
                key={row.key}
                style={s.row(isAttached, dragPath === row.path && isAttached, row.kind === "inherited")}
                draggable={isAttached}
                onDragStart={isAttached ? () => setDragPath(row.path) : undefined}
                onDragOver={isAttached ? (e) => e.preventDefault() : undefined}
                onDrop={isAttached ? () => drop(row.path) : undefined}
                onDragEnd={() => setDragPath(null)}
                onMouseEnter={() => setActiveKey(row.key)}
                onMouseLeave={() => setActiveKey((k) => (k === row.key ? null : k))}
                onFocus={() => setActiveKey(row.key)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setActiveKey((k) => (k === row.key ? null : k));
                  }
                }}
              >
                <Icon.Menu size={14} aria-hidden="true" style={s.grip(isAttached)} />
                <div style={s.checkboxCell}>
                  <CheckboxRow
                    row={row}
                    dir={dir}
                    name={name}
                    onToggle={(on) => onChange(togglePath(attachedPaths, row.path, on))}
                  />
                </div>
                {row.kind === "inherited" && <span style={s.via}>{t("list.viaSkill", { name: row.skillName ?? "" })}</span>}
                {row.missing && isAttached && (
                  <>
                    <span style={s.missing}>{t("list.missing")}</span>
                    <button type="button" style={s.textBtn} onClick={() => onChange(togglePath(attachedPaths, row.path, false))}>
                      {t("list.detach")}
                    </button>
                  </>
                )}
                {row.tokens != null && <span style={s.tokens}>{t("list.footerTokens", { count: row.tokens })}</span>}
                {row.type && colors && (
                  <Badge color={colors.color} bg={colors.bg}>
                    {t(`page.typeBadge.${row.type}`)}
                  </Badge>
                )}
                {/* Fixed-width slot on every row so tokens, badge and Preview line up across rows. */}
                <span style={s.moveSlot}>
                  {isAttached && (
                    <span style={s.moveGroup(activeKey === row.key)}>
                      <button
                        type="button"
                        aria-label={t("list.moveUp")}
                        disabled={index <= 0}
                        style={s.smallBtn(index <= 0)}
                        onClick={() => onChange(moveItem(attachedPaths, index, index - 1))}
                      >
                        <Icon.ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("list.moveDown")}
                        disabled={index >= attachedPaths.length - 1}
                        style={s.smallBtn(index >= attachedPaths.length - 1)}
                        onClick={() => onChange(moveItem(attachedPaths, index, index + 1))}
                      >
                        <Icon.ArrowDown size={14} />
                      </button>
                    </span>
                  )}
                </span>
                {!row.missing && (
                  <button
                    type="button"
                    style={s.previewBtn}
                    onClick={() => onPreview(row.path)}
                  >
                    <Icon.Eye size={14} />
                    <span>{t("list.preview")}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CheckboxRow({
  row,
  dir,
  name,
  onToggle,
}: {
  row: Row;
  dir: string;
  name: string;
  onToggle: (on: boolean) => void;
}) {
  // Visible text is "name dir/"; the full path stays in the accessible name (NFR-6).
  const label = (
    <span style={s.rowLabel}>
      <span style={s.srOnly}>{row.path}</span>
      <span aria-hidden="true" style={s.name}>
        {name}
      </span>
      {dir && (
        <span aria-hidden="true" style={s.dir}>
          {dir}/
        </span>
      )}
    </span>
  );
  // The kit Checkbox has no disabled state; inherited rows use a native disabled input.
  if (row.kind === "inherited") {
    return (
      <label style={s.rowLabel}>
        <input type="checkbox" checked disabled readOnly />
        {label}
      </label>
    );
  }
  return <Checkbox checked={row.kind === "attached"} onChange={onToggle} label={label} />;
}
