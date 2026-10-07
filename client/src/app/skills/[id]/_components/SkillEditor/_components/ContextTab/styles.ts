import type { CSSProperties } from "react";

const MONO = "var(--font-mono)";

export const s = {
  heading: { fontSize: 17, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  footer: { fontFamily: MONO, fontSize: 13, color: "var(--text-primary)", marginTop: 16 } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  serializes: { marginTop: 24 } satisfies CSSProperties,
  serializesLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  codeBlock: {
    padding: "14px 18px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 1.7,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  group: { marginBottom: 6 } satisfies CSSProperties,
  groupHeading: { margin: 0, fontSize: 13, fontWeight: 400, fontFamily: MONO, color: "var(--text-secondary)" } satisfies CSSProperties,
  groupList: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
} as const;
