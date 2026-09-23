import type { CSSProperties } from "react";
import type { DiffLineType } from "./helpers";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 16 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  versionTag: {
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "monospace",
    width: 40,
    flexShrink: 0,
  } satisfies CSSProperties,
  summary: { flex: 1, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  diffBody: {
    padding: 16,
    fontFamily: "monospace",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    maxHeight: "60vh",
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (type: DiffLineType): CSSProperties => ({
    background: type === "add" ? "var(--ok-bg, #052e1c)" : type === "remove" ? "var(--crit-bg)" : "transparent",
    color: type === "add" ? "var(--ok)" : type === "remove" ? "var(--crit)" : "var(--text-secondary)",
    padding: "0 6px",
  }),
} as const;
