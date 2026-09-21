import type { CSSProperties } from "react";

/** Co-located styles for SkillCard (mirrors AgentCard/styles.ts). */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    position: "relative",
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 10,
  }),
  /** Full-card navigation overlay (a real <a>, painted below .aboveLink). */
  cardLink: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    borderRadius: 8,
    color: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  /** Lifts an interactive control (toggle, delete button) above cardLink so
   *  it stays independently clickable instead of triggering navigation. */
  aboveLink: { position: "relative", zIndex: 1 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
} as const;
