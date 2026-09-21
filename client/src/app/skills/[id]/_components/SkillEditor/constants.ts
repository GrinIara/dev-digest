import type { IconName } from "@devdigest/ui";

/** Detail tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SkillEditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly SkillEditorTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "evals", labelKey: "detail.tabs.evals", icon: "FlaskConical" },
];

export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);
