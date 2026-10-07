import type { CSSProperties } from "react";

export const s = {
  label: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    margin: "16px 0 8px",
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 } satisfies CSSProperties,
  link: {
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    font: "inherit",
    color: "var(--accent-text)",
    cursor: "pointer",
  } satisfies CSSProperties,
  plain: { color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { marginLeft: 6, fontSize: 12, color: "var(--text-tertiary)" } satisfies CSSProperties,
} as const;
