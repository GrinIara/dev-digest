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
  /** Inline line under the header row surfacing a failed/no-op resync (T8 bug
   *  fix) — kept separate from `truncatedNote` so the error variant can use
   *  the crit color instead of muted text. */
  resyncNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 6,
  } satisfies CSSProperties,
  resyncNoteError: {
    fontSize: 12,
    color: "var(--crit)",
    marginTop: 6,
  } satisfies CSSProperties,
  emptyText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 8,
  } satisfies CSSProperties,
  /** Muted "these changed files aren't in the index yet" hint (files.indexed
   *  < files.changed, not degraded) — sits above the tree/empty text, per the
   *  PR #218 bug fix: an unindexed-file gap must never read as "no impact". */
  notIndexedNote: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 8,
  } satisfies CSSProperties,
  notIndexedIcon: {
    flexShrink: 0,
    marginTop: 1,
  } satisfies CSSProperties,
  symbolList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginTop: 14,
  } satisfies CSSProperties,
  /** Tree | Graph segmented control (R13, T9): a dark pill container with a
   *  subtle border; the active segment gets a lighter filled background and
   *  bold text, the inactive one stays muted. */
  viewToggle: {
    display: "flex",
    gap: 2,
    padding: 2,
    borderRadius: 999,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  viewToggleButton: (active: boolean): CSSProperties => ({
    padding: "4px 12px",
    borderRadius: 999,
    border: "none",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    fontWeight: active ? 700 : 500,
    fontSize: 12,
    cursor: "pointer",
  }),
} as const;
