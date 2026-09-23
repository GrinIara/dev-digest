import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Skill type -> icon (list card + detail header). */
export const TYPE_ICON: Record<SkillType, IconName> = {
  rubric: "ListChecks",
  convention: "FileText",
  security: "Shield",
  custom: "Wrench",
};
