import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 14,
  } satisfies CSSProperties,
  orDivider: { fontSize: 12, color: "var(--text-muted)", margin: "12px 0", textAlign: "center" } satisfies CSSProperties,
  fileInput: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  trustWarning: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "10px 12px",
    lineHeight: 1.5,
    marginBottom: 16,
  } satisfies CSSProperties,
  previewBody: {
    maxHeight: 220,
    overflow: "auto",
    padding: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    marginBottom: 16,
  } satisfies CSSProperties,
} as const;
