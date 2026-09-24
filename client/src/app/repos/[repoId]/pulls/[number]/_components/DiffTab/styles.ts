import type { CSSProperties } from "react";

/** Co-located styles for the DiffTab header row + Smart/Original toggle. */
export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  summary: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;

/** One segment of the Smart/Original toggle. */
export function toggleBtn(active: boolean): CSSProperties {
  return {
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
  };
}
