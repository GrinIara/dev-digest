import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 760, display: "flex", flexDirection: "column", gap: 28 } satisfies CSSProperties,
  section: {} satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, marginBottom: 10 } satisfies CSSProperties,
  agentList: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
} as const;
