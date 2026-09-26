import type { SmartDiffRole } from "@devdigest/shared";

/** Role-square color — one distinct hue per role. Theme vars where one
   exists; docs has no matching token, so it uses a fixed violet that reads
   on both themes. */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "#8b5cf6",
  boilerplate: "var(--info)",
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

/** Every group starts collapsed; the reviewer opens groups on click. */
export const DEFAULT_COLLAPSED: ReadonlySet<SmartDiffRole> = new Set([
  "core",
  "tests",
  "wiring",
  "docs",
  "boilerplate",
]);
