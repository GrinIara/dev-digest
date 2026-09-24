import type { Severity } from "@devdigest/shared";

/** Maps a finding's severity to the `smartDiff.line*` i18n key for its pill. */
export const SEVERITY_LINE_LABEL = {
  CRITICAL: "lineBlocker",
  WARNING: "lineWarning",
  SUGGESTION: "lineSuggestion",
} as const satisfies Record<Severity, string>;

export const DIFF_ORDER = ["smart", "original"] as const;
export type DiffOrder = (typeof DIFF_ORDER)[number];
