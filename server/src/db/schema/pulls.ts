import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { repos } from './repos';

export const pullRequests = pgTable(
  'pull_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    branch: text('branch').notNull(),
    base: text('base').notNull(),
    headSha: text('head_sha').notNull(),
    lastReviewedSha: text('last_reviewed_sha'),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    filesCount: integer('files_count').notNull().default(0),
    // Only ever set from the schema default ('needs_review', before any GitHub
    // sync) or from `mapStatus()` in the GitHub adapter ('open'/'merged'/'closed')
    // — the derived 'reviewed'/'stale' PrStatus values are read-time only, never
    // persisted here.
    status: text('status').notNull().default('needs_review'),
    body: text('body'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('pr_repo_number_uq').on(t.repoId, t.number), // idempotent import
    wsIdx: index('pr_ws_idx').on(t.workspaceId),
    statusCheck: check(
      'pr_status_check',
      sql`${t.status} IN ('needs_review', 'open', 'merged', 'closed')`,
    ),
  }),
);

export const prFiles = pgTable(
  'pr_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    patch: text('patch'),
  },
  (t) => ({
    prIdx: index('pr_files_pr_id_idx').on(t.prId),
  }),
);

export const prCommits = pgTable(
  'pr_commits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    sha: text('sha').notNull(),
    message: text('message').notNull(),
    author: text('author').notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (t) => ({
    prIdx: index('pr_commits_pr_id_idx').on(t.prId),
  }),
);
