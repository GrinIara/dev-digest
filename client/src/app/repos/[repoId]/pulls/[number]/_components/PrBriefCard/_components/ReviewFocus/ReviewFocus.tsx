"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BriefFocusItem } from "@devdigest/shared";
import { s } from "./styles";

interface ReviewFocusProps {
  items: BriefFocusItem[];
  /** Paths of the PR's changed files; only these can deep-link into the diff. */
  changedPaths: ReadonlySet<string>;
  onOpenFile?: (path: string) => void;
}

export function ReviewFocus({ items, changedPaths, onOpenFile }: ReviewFocusProps) {
  const t = useTranslations("brief");
  if (items.length === 0) return null;
  return (
    <section aria-label={t("reviewFocus", { count: items.length })}>
      <h3 style={s.label}>{t("reviewFocus", { count: items.length })}</h3>
      <ol style={s.list}>
        {items.map((item, i) => {
          const text = `${item.file}:${item.line} — ${item.reason}`;
          return (
            <li key={i}>
              {changedPaths.has(item.file) ? (
                <button type="button" style={s.link} onClick={() => onOpenFile?.(item.file)}>
                  {text}
                </button>
              ) : (
                <span style={s.plain}>
                  {text}
                  <span style={s.note}>{t("notInDiff")}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
