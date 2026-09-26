import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

/**
 * Intent-layer integration tests (T6). Runs against a real Postgres
 * (testcontainers), exercising `POST /pulls/:id/review` → `ensureIntent` →
 * `GET/POST /pulls/:id/intent`.
 *
 * SAFETY: every app instance built here explicitly overrides BOTH `secrets`
 * (a keyless `MockSecretsProvider`) and `github`/`git` — so a missing
 * `openrouter` LLM override never falls through to `LocalSecretsProvider`
 * reading the real `~/.devdigest/secrets.json` and making a live OpenRouter
 * call. This mirrors the "review still completes without an intent" case
 * (scenario 5) deterministically, rather than depending on the host having
 * no real key configured.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

const INTENT_FIXTURE = {
  summary: 'Adds rate limiting to public endpoints.',
  in_scope: ['rate limiting'],
  out_of_scope: ['auth refactor'],
  risk_areas: ['DoS'],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  body: string,
) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting to public endpoints',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('Intent layer (T6, Testcontainers pg)', () => {
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

  function appWith(opts: { includeOpenRouter?: boolean } = {}) {
    const { includeOpenRouter = true } = opts;
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        // Keyless — guarantees a missing llm.openrouter override degrades
        // deterministically to ConfigError, never a real network call.
        secrets: new MockSecretsProvider({}),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient({ issues: { 7: 'error' } }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          ...(includeOpenRouter
            ? {
                openrouter: new MockLLMProvider('openai', {
                  structuredBySchema: { IntentClassification: INTENT_FIXTURE },
                }),
              }
            : {}),
        },
      },
    });
  }

  async function agentFor(app: Awaited<ReturnType<typeof appWith>>) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'IntentAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'reviewer' },
    });
    return created.json();
  }

  it('(1) after a review run, GET /pulls/:id/intent returns confidence low with an unreachable linked_issue #7 source', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting. closes #7');
    const agent = await agentFor(app);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).not.toBeNull();
    expect(body.intent.confidence).toBe('low');
    const issueSource = body.intent.sources.find(
      (s: { kind: string; ref: string | null }) => s.kind === 'linked_issue' && s.ref === '#7',
    );
    expect(issueSource).toBeDefined();
    expect(issueSource.status).toBe('unreachable');

    await app.close();
  });

  it('(2) the run trace carries a distinct intent_classify tool call, a non-null prompt_assembly.intent, and no diff "+" line in intent_call', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting. closes #7');
    const agent = await agentFor(app);

    const runBody = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const runId = runBody.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

    expect(trace.intent_call).not.toBeNull();
    expect(trace.intent_call.status).toBe('classified');
    expect(trace.tool_calls[0].tool).toBe('intent_classify');
    expect(trace.prompt_assembly.intent).not.toBeNull();

    const serializedIntentCall = JSON.stringify(trace.intent_call);
    expect(serializedIntentCall).not.toContain('stripeKey: "sk_live_xxx"');
    expect(serializedIntentCall).not.toMatch(/^\+ /m);

    await app.close();
  });

  it('(3) a second review run on the same PR reuses the stored intent (status "reused")', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting. closes #7');
    const agent = await agentFor(app);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const secondRunBody = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const runId = secondRunBody.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.intent_call.status).toBe('reused');

    await app.close();
  });

  it('(4) POST /pulls/:id/intent/classify re-classifies with a fresh classified_at, and staleness follows a headSha change', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting. closes #7');

    const before = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(before.intent).toBeNull();

    const classifyRes = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    expect(classifyRes.statusCode).toBe(200);
    const classified = classifyRes.json();
    expect(classified.intent).not.toBeNull();
    expect(classified.stale).toBe(false);
    const firstClassifiedAt = new Date(classified.intent.classified_at).getTime();
    expect(Number.isNaN(firstClassifiedAt)).toBe(false);

    const reclassifyRes = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    const reclassified = reclassifyRes.json();
    const secondClassifiedAt = new Date(reclassified.intent.classified_at).getTime();
    expect(secondClassifiedAt).toBeGreaterThanOrEqual(firstClassifiedAt);

    // Advance the PR's head — the stored intent was classified against the
    // old sha, so a subsequent GET must report staleness.
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'newsha1234' })
      .where(eq(t.pullRequests.id, pr.id));

    const afterMove = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(afterMove.stale).toBe(true);

    await app.close();
  });

  it('(5) with no OpenRouter provider available, the review still completes and intent_call.status is "failed"', async () => {
    const app = await appWith({ includeOpenRouter: false });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting. closes #7');
    const agent = await agentFor(app);

    const runBody = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const runs = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, pr.id));
    expect(runs.find((r) => r.id === runBody.runs[0].run_id)?.status).toBe('done');

    const runId = runBody.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.intent_call.status).toBe('failed');

    const intentRes = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(intentRes.intent).toBeNull();

    await app.close();
  });

  it('(6) GET /pulls/:id/intent 404s on an unknown uuid and 422s on a non-uuid', async () => {
    const app = await appWith();

    const unknown = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/intent',
    });
    expect(unknown.statusCode).toBe(404);

    const invalid = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/intent' });
    expect(invalid.statusCode).toBe(422);

    await app.close();
  });
});
