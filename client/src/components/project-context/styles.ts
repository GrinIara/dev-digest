import type { CSSProperties } from "react";

/** Styles shared by the Context tabs' doc list and drawer. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 6, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  filter: { marginBottom: 12 } satisfies CSSProperties,
  row: (dragging: boolean, disabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    opacity: dragging ? 0.5 : disabled ? 0.75 : 1,
  }),
  checkboxCell: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowLabel: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0 } satisfies CSSProperties,
  path: { fontSize: 13, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  meta: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  missing: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
  via: { fontSize: 11, color: "var(--text-secondary)" } satisfies CSSProperties,
  smallBtn: (disabled: boolean): CSSProperties => ({
    width: 24,
    height: 24,
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    padding: 0,
  }),
  textBtn: {
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-secondary)", padding: "12px 0" } satisfies CSSProperties,

  // ---- drawer ----
  drawerMeta: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, fontSize: 12 } satisfies CSSProperties,
  drawerToggle: { display: "inline-flex", alignItems: "center", gap: 8, marginLeft: "auto", fontSize: 13 } satisfies CSSProperties,
  drawerBody: { fontSize: 14, overflowWrap: "anywhere" } satisfies CSSProperties,
};
