import type { CSSProperties } from "react";

export const s = {
  wrap: { position: "relative", display: "inline-flex" } satisfies CSSProperties,
  tip: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 6,
    padding: "6px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    color: "var(--text-secondary)",
    fontSize: 12,
    whiteSpace: "nowrap",
    zIndex: 10,
  } satisfies CSSProperties,
} as const;
