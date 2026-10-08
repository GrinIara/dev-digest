import type { CSSProperties } from "react";

export const s = {
  card: { padding: 18 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  summary: {
    margin: "12px 0 16px",
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  banner: { marginTop: 12 } satisfies CSSProperties,
  empty: { margin: "10px 0 14px", fontSize: 13, color: "var(--text-tertiary)" } satisfies CSSProperties,
  error: {
    marginTop: 12,
    padding: "8px 12px",
    border: "1px solid var(--crit)",
    borderRadius: 6,
    color: "var(--crit)",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
