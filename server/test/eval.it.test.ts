import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A unified diff touching src/config.ts (line 11 added). */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture with one grounded finding on line 11. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

d('eval module — eval_cases/eval_runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          openrouter: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
        },
      },
    });
  }

  async function insertSkill(db: PgFixture['handle']['db'], body: string) {
    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'No hardcoded secrets',
        description: 'Flags hardcoded secrets in diffs.',
        type: 'security',
        source: 'manual',
        body,
        enabled: true,
      })
      .returning();
    return skill!;
  }

  it('CRUD: create, get, list (filtered), patch, delete', async () => {
    const app = await appWith();
    const skill = await insertSkill(pg.handle.db, 'Never commit secrets.');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: {
          owner_kind: 'skill',
          owner_id: skill.id,
          name: 'Stripe key case',
          input_diff: DIFF,
          notes: 'seed case',
        },
      })
    ).json();
    expect(created.owner_kind).toBe('skill');
    expect(created.owner_id).toBe(skill.id);
    expect(created.input_diff).toBe(DIFF);

    const got = (
      await app.inject({ method: 'GET', url: `/eval-cases/${created.id}` })
    ).json();
    expect(got.id).toBe(created.id);

    const listed = (
      await app.inject({
        method: 'GET',
        url: `/eval-cases?owner_kind=skill&owner_id=${skill.id}`,
      })
    ).json();
    expect(listed.some((c: { id: string }) => c.id === created.id)).toBe(true);

    const patched = (
      await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: { notes: 'updated note' },
      })
    ).json();
    expect(patched.notes).toBe('updated note');

    const deleted = (
      await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` })
    ).json();
    expect(deleted.ok).toBe(true);

    const afterDelete = await app.inject({ method: 'GET', url: `/eval-cases/${created.id}` });
    expect(afterDelete.statusCode).toBe(404);

    await app.close();
  });

  it('404s for a case in another workspace / nonexistent id', async () => {
    const app = await appWith();
    const res = await app.inject({
      method: 'GET',
      url: '/eval-cases/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('run action (skill owner): reviews the diff with only that skill, persists one eval_runs row', async () => {
    const app = await appWith();
    const skill = await insertSkill(pg.handle.db, 'Flag any hardcoded secret in the diff.');

    const kase = (
      await app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: {
          owner_kind: 'skill',
          owner_id: skill.id,
          name: 'Skill eval case',
          input_diff: DIFF,
        },
      })
    ).json();

    const run = (
      await app.inject({ method: 'POST', url: `/eval-cases/${kase.id}/run` })
    ).json();
    expect(run.case_id).toBe(kase.id);
    expect(run.pass).toBe(true);
    expect(run.duration_ms).toBeGreaterThanOrEqual(0);
    expect(run.actual_output.findings).toHaveLength(1);
    expect(run.actual_output.findings[0].file).toBe('src/config.ts');

    const runs = (
      await app.inject({ method: 'GET', url: `/eval-cases/${kase.id}/runs` })
    ).json();
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(run.id);

    await app.close();
  });

  it('run action (agent owner): reuses the agent config + linked enabled skills', async () => {
    const app = await appWith();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Eval Test Agent',
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'You are a reviewer.',
        },
      })
    ).json();

    const kase = (
      await app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: {
          owner_kind: 'agent',
          owner_id: agent.id,
          name: 'Agent eval case',
          input_diff: DIFF,
          expected_output: { min_findings: 1 },
        },
      })
    ).json();

    const run = (
      await app.inject({ method: 'POST', url: `/eval-cases/${kase.id}/run` })
    ).json();
    expect(run.case_id).toBe(kase.id);
    expect(run.pass).toBe(true);
    expect(run.actual_output.findings).toHaveLength(1);

    await app.close();
  });

  it('run action: a case whose owner no longer exists is persisted as a failed run, not lost', async () => {
    const app = await appWith();
    const kase = (
      await app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: {
          owner_kind: 'skill',
          owner_id: '00000000-0000-0000-0000-000000000000',
          name: 'Orphan owner case',
          input_diff: DIFF,
        },
      })
    ).json();

    const run = (
      await app.inject({ method: 'POST', url: `/eval-cases/${kase.id}/run` })
    ).json();
    expect(run.pass).toBe(false);
    expect(run.actual_output.error).toContain('Skill not found');

    await app.close();
  });
});
