import { z } from 'zod';

/**
 * One definition per shared argument, reused by every tool that takes it, so
 * names/types/descriptions stay identical across tools (§6a). Every
 * `.describe()` string here is copied VERBATIM from plan §6b-final — do not
 * rephrase; `test/tools-list.test.ts` asserts these character-for-character.
 *
 * Must stay in sync with `domain/ports.ts`'s `ConventionCategory` (and the
 * real API's `ConventionCategory` enum, `server/src/vendor/shared/contracts/
 * knowledge.ts`) — duplicated here only because it needs to exist as a
 * runtime `z.enum()` array, not just a type.
 */
const CONVENTION_CATEGORIES = [
  'naming',
  'structure',
  'errors',
  'testing',
  'imports',
  'typing',
  'api',
  'general',
] as const;

export const repoField = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .describe('GitHub repo as "owner/name", as added in DevDigest');

export const prField = z
  .number()
  .int()
  .positive()
  .max(10_000_000)
  .describe('Pull request number, e.g. 482');

export const agentField = z
  .string()
  .min(1)
  .max(100)
  .describe('Agent id or exact name from list_agents');

export const runIdField = z
  .string()
  .uuid()
  .optional()
  .describe('Run id returned by run_agent_on_pr; omit for the latest review');

export const minSeverityField = z
  .enum(['CRITICAL', 'WARNING', 'SUGGESTION'])
  .optional()
  .describe('Only findings at or above this severity');

export const maxFindingsField = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe('Max findings to return (default 20)');

/** Findings-only variant — see plan §6b-final: `response_format` has two
 * different descriptions, so it is not a single shared field. */
export const findingsResponseFormat = z
  .enum(['concise', 'detailed'])
  .optional()
  .describe('detailed adds full rationale and suggestion');

export const categoryField = z
  .enum(CONVENTION_CATEGORIES)
  .optional()
  .describe('Only rules in this category');

export const maxRulesField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Max rules to return (default 25)');

/** Conventions-only variant — see plan §6b-final. */
export const conventionsResponseFormat = z
  .enum(['concise', 'detailed'])
  .optional()
  .describe('detailed adds the evidence snippet');
