import { z } from 'zod';

/** Project Context: repo Markdown docs attached to agents/skills and injected into the reviewer prompt. */

export const NOT_CLONED_CODE = 'not_cloned' as const;
export const LOCAL_EDITS_CODE = 'local_edits' as const;

export const ContextDocType = z.enum(['specs', 'docs', 'insights']);
export type ContextDocType = z.infer<typeof ContextDocType>;

/** Repo-relative, forward-slash doc path; rejects absolute, traversal, backslash and NUL. */
export const ContextDocPath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !/^[A-Za-z]:/.test(p) &&
      !p.split('/').includes('..') &&
      !p.includes('\\') &&
      !p.includes('\0'),
    { message: 'invalid document path' },
  );
export type ContextDocPath = z.infer<typeof ContextDocPath>;

export const ContextDoc = z.object({
  path: z.string(),
  name: z.string(),
  dir: z.string(),
  type: ContextDocType,
  tokens: z.number().int().nonnegative(),
  used_by: z.number().int().nonnegative(),
  locally_modified: z.boolean(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

export const ContextDocList = z.object({
  /** Display labels of the discovery roots: `"<dir>/"` per configured folder plus `"README.md"`. */
  roots: z.array(z.string()),
  total_tokens: z.number().int().nonnegative(),
  docs: z.array(ContextDoc),
});
export type ContextDocList = z.infer<typeof ContextDocList>;

export const ContextDocContent = ContextDoc.extend({ content: z.string() });
export type ContextDocContent = z.infer<typeof ContextDocContent>;

export const ContextDocPathQuery = z.object({ path: ContextDocPath });
export type ContextDocPathQuery = z.infer<typeof ContextDocPathQuery>;

export const SaveContextDocBody = z.object({ content: z.string() });
export type SaveContextDocBody = z.infer<typeof SaveContextDocBody>;

export const ContextAttachmentStatus = z.enum(['present', 'missing']);
export type ContextAttachmentStatus = z.infer<typeof ContextAttachmentStatus>;

/** `tokens` is null when missing; `type` is null only if the path is no longer discoverable. */
export const ContextAttachedRow = z.object({
  path: z.string(),
  type: ContextDocType.nullable(),
  tokens: z.number().int().nonnegative().nullable(),
  status: ContextAttachmentStatus,
});
export type ContextAttachedRow = z.infer<typeof ContextAttachedRow>;

export const ContextInheritedRow = ContextAttachedRow.extend({
  skill_id: z.string().uuid(),
  skill_name: z.string(),
});
export type ContextInheritedRow = z.infer<typeof ContextInheritedRow>;

export const AgentContext = z.object({
  repo_id: z.string().uuid(),
  attached: z.array(ContextAttachedRow),
  inherited: z.array(ContextInheritedRow),
  header_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type AgentContext = z.infer<typeof AgentContext>;

export const SkillContext = z.object({
  repo_id: z.string().uuid(),
  attached: z.array(ContextAttachedRow),
  header_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type SkillContext = z.infer<typeof SkillContext>;

export const ContextRepoQuery = z.object({ repo_id: z.string().uuid() });
export type ContextRepoQuery = z.infer<typeof ContextRepoQuery>;

export const SetContextAttachmentsBody = z
  .object({ paths: z.array(ContextDocPath) })
  .refine((b) => new Set(b.paths).size === b.paths.length, {
    message: 'duplicate path',
    path: ['paths'],
  });
export type SetContextAttachmentsBody = z.infer<typeof SetContextAttachmentsBody>;

export const ResyncQuery = z.object({
  discard_local_edits: z.enum(['true', 'false']).optional(),
});
export type ResyncQuery = z.infer<typeof ResyncQuery>;

export const LocalEditsConflictDetails = z.object({ paths: z.array(z.string()) });
export type LocalEditsConflictDetails = z.infer<typeof LocalEditsConflictDetails>;
