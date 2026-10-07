import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 16, fontSize: 12, color: "var(--text-tertiary)" } satisfies CSSProperties,
  note: { marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" } satisfies CSSProperties,
} as const;
