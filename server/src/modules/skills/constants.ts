import type { SkillSource } from '@devdigest/shared';

/** Constants for the skills module. */

/** Initial config version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Change-summary snapshot text for a skill's first version. */
export const INITIAL_SKILL_CHANGE_SUMMARY = 'Initial version';

/** Default change-summary text when a PATCH bumps the version without one. */
export const DEFAULT_SKILL_CHANGE_SUMMARY = 'Updated skill';

/** Default `source` for a plain `POST /skills` create (vs. the import flow's `extracted`). */
export const DEFAULT_SKILL_SOURCE: SkillSource = 'manual';
