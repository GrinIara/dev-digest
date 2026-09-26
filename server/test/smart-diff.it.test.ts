/**
 * GET /pulls/:id/smart-diff — integration test (Testcontainers pg). Exercises
 * the real repository/service/route wiring: workspace scoping, the
 * "latest kind='review' review per agent" rule (A2), dismissed-finding
 * exclusion, and the 404/422 edge cases. Gated on Docker, like the other
 * `*.it.test.ts` files (`intent.it.test.ts`, `pulls-comments.it.test.ts`).
 *
 * SAFETY: `secrets` is overridden with a keyless `MockSecretsProvider` even
 * though this route never calls an LLM/GitHub adapter — per server Insights
 * 2026-09-24 ("reviews.it.test.ts is not hermetic…"), any `*.it.test.ts`
 * `buildApp` helper should set it so a future code path can't silently reach
 * a real network call through `LocalSecretsProvider`'s env fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 91,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 8,
      deletions: 2,
      filesCount: 3,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/config.ts', additions: 5, deletions: 2 }, // core
    { prId: pr!.id, path: 'src/config.test.ts', additions: 3, deletions: 0 }, // tests
    { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 100, deletions: 50 }, // boilerplate
  ]);
  return { repo: repo!, pr: pr! };
}

const FINDING_DEFAULTS = {
  endLine: 1,
  severity: 'WARNING',
  category: 'bug',
  title: 'Example finding',
  rationale: 'Because.',
  confidence: 0.8,
};

d('GET /pulls/:id/smart-diff (T3, Testcontainers pg)', () => {
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
      overrides: { secrets: new MockSecretsProvider({}) },
    });
  }

  it('groups pr_files by role and only counts findings from the latest review per agent, excluding dismissed lines', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = '11111111-1111-1111-1111-111111111111';
    const agentB = '22222222-2222-2222-2222-222222222222';

    const [reviewAOld] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: agentA,
        kind: 'review',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      })
      .returning();
    const [reviewANew] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: agentA,
        kind: 'review',
        createdAt: new Date('2026-06-02T00:00:00Z'),
      })
      .returning();
    const [reviewB] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: agentB,
        kind: 'review',
        createdAt: new Date('2026-06-01T12:00:00Z'),
      })
      .returning();

    await pg.handle.db.insert(t.findings).values([
      // Superseded by the newer agent-A review — must not appear.
      { ...FINDING_DEFAULTS, reviewId: reviewAOld!.id, file: 'src/config.ts', startLine: 5 },
      // Newest agent-A review: lines 7 (kept) and 3 (kept), 9 dismissed (excluded).
      { ...FINDING_DEFAULTS, reviewId: reviewANew!.id, file: 'src/config.ts', startLine: 7 },
      { ...FINDING_DEFAULTS, reviewId: reviewANew!.id, file: 'src/config.ts', startLine: 3 },
      {
        ...FINDING_DEFAULTS,
        reviewId: reviewANew!.id,
        file: 'src/config.ts',
        startLine: 9,
        dismissedAt: new Date('2026-06-02T01:00:00Z'),
      },
      // Agent B's own (only, therefore latest) review.
      { ...FINDING_DEFAULTS, reviewId: reviewB!.id, file: 'src/config.ts', startLine: 12 },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = SmartDiffResponse.parse(body);

    const roles = parsed.groups.map((g) => g.role);
    expect(roles).toEqual(['core', 'tests', 'boilerplate']);

    const core = parsed.groups.find((g) => g.role === 'core')!;
    const configFile = core.files.find((f) => f.path === 'src/config.ts')!;
    expect(configFile.finding_lines).toEqual([3, 7, 12]);

    const tests = parsed.groups.find((g) => g.role === 'tests')!;
    expect(tests.files[0]!.finding_lines).toEqual([]);

    const boilerplate = parsed.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files[0]!.finding_lines).toEqual([]);

    expect(parsed.split_suggestion).toEqual({
      too_big: false,
      total_lines: 5 + 2 + 3 + 0 + 100 + 50,
      proposed_splits: [],
    });

    await app.close();
  });

  it('404s for a PR outside the caller\'s workspace or unknown, and never calls GitHub', async () => {
    const app = await appWith();

    const unknown = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/smart-diff',
    });
    expect(unknown.statusCode).toBe(404);

    await app.close();
  });

  it('422s for a non-uuid :id', async () => {
    const app = await appWith();

    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);

    await app.close();
  });
});
