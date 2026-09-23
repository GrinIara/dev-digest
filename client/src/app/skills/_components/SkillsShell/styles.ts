import type { CSSProperties } from "react";

/** Co-located styles for SkillsShell (mirrors agents/[id]/page.tsx's inline
 *  split-view row). */
export const s = {
  row: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  detail: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
} as const;
