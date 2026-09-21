import type { SkillType } from "@devdigest/shared";

/** Default type for an extracted skill — the parse-only draft doesn't
 *  return a type, so the user picks one on the preview step. */
export const DEFAULT_TYPE: SkillType = "custom";

export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Modal width (px). */
export const MODAL_WIDTH = 620;
