import type { CSSProperties } from "react";

/** Co-located styles for SkillsSidebar (280px master list, mirrors
 *  agents/[id]/_components/AgentsSidebar's layout + SkillsListView's former
 *  search-input styling). */
export const s = {
  wrap: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  header: { padding: "16px 16px 12px", flexShrink: 0 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  listState: { padding: "0 16px 12px" } satisfies CSSProperties,
  listLoading: { display: "flex", flexDirection: "column", gap: 10, padding: "0 12px 12px" } satisfies CSSProperties,
} as const;
