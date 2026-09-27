import type { CSSProperties } from "react";

export const s = {
  /** Flex-wrap instead of an equal-column grid so the Blast radius card can
   *  grow to its content: long caller paths push it onto its own full-width
   *  row rather than overflowing a fixed half-width column. */
  cardsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  intentSlot: { flex: "1 1 460px", minWidth: 0 } satisfies CSSProperties,
  /** `flex-basis: auto` = the card's max-content width, so it sits next to
   *  IntentCard when it fits and wraps + stretches to 100% when it doesn't. */
  blastSlot: { flex: "1 1 auto", minWidth: "min(460px, 100%)", maxWidth: "100%" } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
