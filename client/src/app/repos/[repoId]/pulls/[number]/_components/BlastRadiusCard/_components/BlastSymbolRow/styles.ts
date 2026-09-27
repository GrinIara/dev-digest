import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
  } satisfies CSSProperties,
  headerLeft: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)" } satisfies CSSProperties,
  symbolName: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  callerCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  callersList: {
    marginTop: 6,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    paddingLeft: 14,
    fontSize: 13,
  } satisfies CSSProperties,
  callerArrow: { color: "var(--text-muted)" } satisfies CSSProperties,
  callerLinkStatic: { color: "var(--text-secondary)" } satisfies CSSProperties,
  /** Mirrors `@devdigest/ui`'s `MonoLink` hover behaviour (accent colour +
   *  underline on hover) — this row can't reuse `MonoLink` itself because it
   *  needs a custom `aria-label` that `MonoLink` doesn't pass through. */
  callerLink: (hovered: boolean): CSSProperties => ({
    color: hovered ? "var(--accent-text)" : "var(--text-secondary)",
    textDecoration: hovered ? "underline" : "none",
    textUnderlineOffset: 2,
  }),
  chipsRow: {
    marginTop: 8,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 14,
  } satisfies CSSProperties,
} as const;
