import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 880 } satisfies CSSProperties,
  heading: { fontSize: 17, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  code: { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  footerTokens: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  footerNote: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
