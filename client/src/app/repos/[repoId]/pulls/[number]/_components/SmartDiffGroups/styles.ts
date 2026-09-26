import type { CSSProperties } from "react";

/** Co-located styles for the SmartDiffGroups role sections. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10, marginTop: 10 } satisfies CSSProperties,
  group: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,
  roleSquare: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 } satisfies CSSProperties,
  roleLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  roleHint: {
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  files: {
    borderTop: "1px solid var(--border)",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is expanded. */
export function chevronFor(expanded: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}
