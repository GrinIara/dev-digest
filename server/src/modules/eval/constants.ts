/** Constants for the eval module. */

/**
 * Skill-owner eval runs have no bound agent (and therefore no configured
 * provider/model) — use a fixed, cheap default so a skill's eval case can be
 * run in isolation. Matches the seed data's default agent provider/model
 * (see `db/seed.ts`).
 */
export const SKILL_EVAL_PROVIDER = 'openrouter' as const;
export const SKILL_EVAL_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Minimal generic system prompt for a skill-owner eval run: the point of the
 * run is to exercise ONLY the skill's own rule, not a full agent persona.
 */
export const SKILL_EVAL_SYSTEM_PROMPT =
  'You are a code reviewer. Apply only the rule below to the diff.';
