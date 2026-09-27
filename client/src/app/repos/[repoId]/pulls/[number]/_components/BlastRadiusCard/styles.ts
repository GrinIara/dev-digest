import type { CSSProperties } from "react";

export const s = {
  card: {} satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  truncatedNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 8,
  } satisfies CSSProperties,
  emptyText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 8,
  } satisfies CSSProperties,
  symbolList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginTop: 14,
  } satisfies CSSProperties,
} as const;
