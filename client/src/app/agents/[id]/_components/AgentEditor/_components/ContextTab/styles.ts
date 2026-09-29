import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-muted)", marginTop: 12 } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
