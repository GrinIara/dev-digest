import { pgTable, uuid, text, integer, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { repos } from './repos';
import { agents } from './agents';
import { skills } from './skills';

// ====================================================== Project Context docs
// Ordered attachments of repo-relative markdown docs to an agent or a skill.
// PK's leading column covers owner lookups; the repo_id index covers `used_by`
// queries and FK cascade deletes (Postgres does not auto-index FK columns).

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.repoId, t.path] }),
    repoIdx: index('agent_context_docs_repo_idx').on(t.repoId),
    posCheck: check('agent_context_docs_position_nonneg', sql`${t.position} >= 0`),
    pathLen: check('agent_context_docs_path_len', sql`char_length(${t.path}) BETWEEN 1 AND 1024`),
  }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.repoId, t.path] }),
    repoIdx: index('skill_context_docs_repo_idx').on(t.repoId),
    posCheck: check('skill_context_docs_position_nonneg', sql`${t.position} >= 0`),
    pathLen: check('skill_context_docs_path_len', sql`char_length(${t.path}) BETWEEN 1 AND 1024`),
  }),
);
