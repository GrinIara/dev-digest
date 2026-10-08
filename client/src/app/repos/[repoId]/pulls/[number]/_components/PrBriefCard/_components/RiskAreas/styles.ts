import type { CSSProperties } from "react";

export const s = {
  label: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    margin: "0 0 8px",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 } satisfies CSSProperties,
  title: { fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  ref: { fontSize: 12, color: "var(--text-tertiary)" } satisfies CSSProperties,
  toggle: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    color: "var(--accent-text)",
    fontSize: 12,
    cursor: "pointer",
  } satisfies CSSProperties,
  explanation: {
    margin: "4px 0 0 24px",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
} as const;
