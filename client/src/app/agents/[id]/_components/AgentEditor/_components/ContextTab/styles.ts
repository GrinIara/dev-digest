import type { CSSProperties } from "react";

/** Co-located styles for ContextTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 20 } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
