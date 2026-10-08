import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrBrief } from '@devdigest/shared';

/**
 * Brief data-access. The ONLY file in this module that imports
 * `drizzle-orm`/`db/schema`. One row per PR in `pr_brief` (json blob).
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async getBriefJson(prId: string): Promise<unknown | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row?.json;
  }

  async upsertBrief(prId: string, json: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}
