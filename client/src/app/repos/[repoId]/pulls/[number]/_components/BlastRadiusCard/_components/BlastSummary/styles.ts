import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  stats: { display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" } satisfies CSSProperties,
  stat: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  statIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
