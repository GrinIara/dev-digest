import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.45 } satisfies CSSProperties,
  filterWrap: { marginBottom: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowDragging: { opacity: 0.5 } satisfies CSSProperties,
  handle: {
    cursor: "grab",
    color: "var(--text-muted)",
    display: "flex",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: { flex: 1, fontSize: 14, color: "var(--text-primary)" } satisfies CSSProperties,
  desc: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
