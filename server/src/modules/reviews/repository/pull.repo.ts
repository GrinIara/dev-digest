import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { IntentSource, type Intent, type PrIntentRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';
import { z } from 'zod';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(
  db: Db,
  prId: string,
  intent: Intent,
  meta: { model: string | null; headSha: string | null },
): Promise<void> {
  const values = {
    prId,
    intent: intent.summary,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    riskAreas: intent.risk_areas,
    confidence: intent.confidence,
    sources: intent.sources,
    model: meta.model,
    headSha: meta.headSha,
    classifiedAt: new Date(),
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: {
        intent: values.intent,
        inScope: values.inScope,
        outOfScope: values.outOfScope,
        riskAreas: values.riskAreas,
        confidence: values.confidence,
        sources: values.sources,
        model: values.model,
        headSha: values.headSha,
        classifiedAt: values.classifiedAt,
      },
    });
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    pr_id: row.prId,
    summary: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: row.riskAreas,
    confidence: row.confidence === 'high' ? 'high' : 'low',
    // A malformed jsonb value (e.g. from a manual DB edit) can't crash a
    // read — fall back to an empty sources list rather than throwing.
    sources: z.array(IntentSource).catch([]).parse(row.sources),
    model: row.model,
    head_sha: row.headSha,
    classified_at: row.classifiedAt.toISOString(),
  };
}
