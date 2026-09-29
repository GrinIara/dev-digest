import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 } satisfies CSSProperties,
  heading: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "2px 0 0" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-muted)", marginTop: 12 } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  serializes: { marginTop: 20, padding: 12, border: "1px solid var(--border)", borderRadius: 8 } satisfies CSSProperties,
  serializesLabel: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 } satisfies CSSProperties,
  groupHeading: { fontSize: 13, fontWeight: 600, margin: "8px 0 4px" } satisfies CSSProperties,
  groupList: { margin: 0, paddingLeft: 18, fontSize: 12 } satisfies CSSProperties,
} as const;
