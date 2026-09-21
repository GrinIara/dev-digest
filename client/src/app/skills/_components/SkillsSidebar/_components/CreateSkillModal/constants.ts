import type { SkillType } from "@devdigest/shared";

/** Default type for a new skill. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Selectable skill types in the create form (labels are i18n'd in the component). */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Modal width (px), matches CreateAgentModal. */
export const MODAL_WIDTH = 620;
