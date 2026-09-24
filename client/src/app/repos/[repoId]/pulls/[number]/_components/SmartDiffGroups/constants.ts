import type { SmartDiffRole } from "@devdigest/shared";

/** Role-square color, using existing CSS vars (no new tokens). */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--sugg)",
  wiring: "var(--info)",
  docs: "var(--text-muted)",
  boilerplate: "var(--border)",
};

export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

export const ROLE_HINT_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreHint",
  tests: "smartDiff.testsHint",
  wiring: "smartDiff.wiringHint",
  docs: "smartDiff.docsHint",
  boilerplate: "smartDiff.boilerplateHint",
};

export const DEFAULT_COLLAPSED: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);
