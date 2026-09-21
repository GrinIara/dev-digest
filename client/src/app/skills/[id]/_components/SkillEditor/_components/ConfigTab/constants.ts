import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels are i18n'd in the component). */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Loose kebab-case check — a hint, not a hard client-side validation gate. */
export const KEBAB_HINT_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
