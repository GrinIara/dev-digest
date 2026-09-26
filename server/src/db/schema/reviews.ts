import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index, check } from 'drizzle-orm/pg-core';
import type { IntentSource } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id'),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    prIdx: index('reviews_pr_id_idx').on(t.prId),
    wsIdx: index('reviews_ws_id_idx').on(t.workspaceId),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    // Backed by the `Severity` Zod enum (CRITICAL/WARNING/SUGGESTION) —
    // only Zod enforced it before; mirror it as a DB-level backstop.
    severity: text('severity').notNull(),
    // Backed by the `FindingCategory` Zod enum (bug/security/perf/style/test).
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    reviewIdx: index('findings_review_id_idx').on(t.reviewId),
    severityCheck: check(
      'findings_severity_check',
      sql`${t.severity} IN ('CRITICAL', 'WARNING', 'SUGGESTION')`,
    ),
    categoryCheck: check(
      'findings_category_check',
      sql`${t.category} IN ('bug', 'security', 'perf', 'style', 'test')`,
    ),
  }),
);

export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    // Stores the classification's `summary` field (contract renamed
    // `intent` -> `summary`; the DB column name is unchanged to avoid a
    // drizzle-kit interactive rename prompt on a table with no writers/data).
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    riskAreas: jsonb('risk_areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Backed by the `IntentConfidence` Zod enum (high/low); DB-level backstop
    // like `findings_severity_check`.
    confidence: text('confidence').notNull().default('low'),
    sources: jsonb('sources').$type<IntentSource[]>().notNull().default(sql`'[]'::jsonb`),
    model: text('model'),
    /** The PR head sha the intent was classified against; null until first
        classified. Used to compute the `stale` flag. */
    headSha: text('head_sha'),
    classifiedAt: timestamp('classified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    confidenceCheck: check('pr_intent_confidence_check', sql`${t.confidence} IN ('high', 'low')`),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
