import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 20 } satisfies CSSProperties,
} as const;
