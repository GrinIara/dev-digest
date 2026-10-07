import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

export const SEVERITY_META: Record<RiskSeverity, { icon: IconName; color: string }> = {
  high: { icon: "AlertOctagon", color: "var(--crit)" },
  medium: { icon: "AlertTriangle", color: "var(--warn)" },
  low: { icon: "Lightbulb", color: "var(--sugg)" },
};
