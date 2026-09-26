import type { CSSProperties } from "react";

/** Co-located styles for IntentCard. */
export const s = {
  card: {
    marginBottom: 20,
  } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  summary: {
    margin: "0 0 14px",
    paddingLeft: 12,
    borderLeft: "2px solid var(--border-strong)",
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginBottom: 14,
  } satisfies CSSProperties,
  columnLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  emptyListItem: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  } satisfies CSSProperties,
  sourcesFooter: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  warning: {
    marginTop: 10,
    fontSize: 12.5,
    color: "var(--warn)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
