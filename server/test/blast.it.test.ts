/**
 * GET /pulls/:id/blast — integration test (Testcontainers pg). Exercises the
 * real repository/service/route wiring against a hand-seeded repo-intel
 * index: workspace scoping, the persistent-index happy path (≥2 callers, ≥1
 * endpoint, the cron kept separate from endpoints), a same-file reference
 * never resolving to its own declaring file through the real
 * `resolveReferences` import-graph join (P2 — see "self-caller" test below),
 * the degraded/no-index path, and the 404/422 edge cases.
 *
 * SAFETY: `secrets` is overridden with a keyless `MockSecretsProvider` per
 * server Insights 2026-09-24, even though this route never calls an
 * LLM/GitHub adapter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { BlastRadiusResponse } from '@devdigest/shared';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, files: string[]) {
  const name = `blast-${repoSeq++}`;
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
      title: 'Tweak rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 3,
      deletions: 1,
      filesCount: files.length,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/blast (T3, Testcontainers pg)', () => {
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

  it('reads a full persistent index: ≥2 callers, ≥1 endpoint, the cron kept separate, indexed_sha from the index', async () => {
    const app = await appWith();
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId, ['src/lib/rate.ts']);
    const repoIntelRepo = new RepoIntelRepository(pg.handle.db);

    await repoIntelRepo.insertSymbols([
      {
        repoId: repo.id,
        path: 'src/lib/rate.ts',
        name: 'rateLimit',
        kind: 'function',
        line: 1,
        endLine: 10,
        exported: true,
        signature: 'function rateLimit()',
        contentHash: 'h1',
      },
    ]);

    // Resolved cross-file callers (declFile already set, as `resolveReferences`
    // would leave it after resolving through an import edge — see the
    // dedicated "self-caller" test below for that resolution happening for
    // real).
    await pg.handle.db.insert(t.references).values([
      { repoId: repo.id, fromPath: 'src/api/public/index.ts', toSymbol: 'rateLimit', line: 23, declFile: 'src/lib/rate.ts' },
      { repoId: repo.id, fromPath: 'src/api/webhooks.ts', toSymbol: 'rateLimit', line: 10, declFile: 'src/lib/rate.ts' },
    ]);

    // `getResolvedCallers` inner-joins `file_rank` on every caller `fromPath`.
    await pg.handle.db.insert(t.fileRank).values([
      { repoId: repo.id, filePath: 'src/api/public/index.ts', pagerank: 0.8, hotness: 0, rank: 0.8, percentile: 90 },
      { repoId: repo.id, filePath: 'src/api/webhooks.ts', pagerank: 0.5, hotness: 0, rank: 0.5, percentile: 60 },
      { repoId: repo.id, filePath: 'src/lib/rate.ts', pagerank: 0.9, hotness: 0, rank: 0.9, percentile: 95 },
    ]);

    await pg.handle.db.insert(t.fileFacts).values([
      {
        repoId: repo.id,
        filePath: 'src/api/public/index.ts',
        endpoints: ['GET /api/public/items'],
        crons: ['job:reset-rate-buckets'],
      },
    ]);

    await repoIntelRepo.upsertIndexState({
      repoId: repo.id,
      lastIndexedSha: 'abc123',
      indexerVersion: 2,
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      stats: {},
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = BlastRadiusResponse.parse(body);

    expect(parsed.degraded).toBe(false);
    expect(parsed.reason).toBeNull();
    expect(parsed.indexed_sha).toBe('abc123');
    expect(parsed.downstream).toHaveLength(1);

    const group = parsed.downstream[0]!;
    expect(group.symbol).toBe('rateLimit');
    expect(group.callers.length).toBeGreaterThanOrEqual(2);
    expect(group.endpoints_affected).toContain('GET /api/public/items');
    expect(group.crons_affected).toContain('job:reset-rate-buckets');
    expect(group.endpoints_affected).not.toContain('job:reset-rate-buckets');

    expect(parsed.counts.callers).toBeGreaterThanOrEqual(2);
    expect(parsed.counts.endpoints).toBeGreaterThanOrEqual(1);

    // R follow-up: the PR's one changed file (`src/lib/rate.ts`) has a
    // `file_rank` row (seeded above), so it counts as indexed — and the repo
    // seeds with the schema default branch ('main').
    expect(parsed.files).toEqual({ changed: 1, indexed: 1 });
    expect(parsed.indexed_branch).toBe('main');

    await app.close();
  });

  it('a same-file reference never resolves to its own declaring file through the real resolveReferences import-graph join (P2)', async () => {
    const app = await appWith();
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId, ['src/lib/rate.ts']);
    const repoIntelRepo = new RepoIntelRepository(pg.handle.db);

    await repoIntelRepo.insertSymbols([
      {
        repoId: repo.id,
        path: 'src/lib/rate.ts',
        name: 'rateLimit',
        kind: 'function',
        line: 1,
        endLine: 10,
        exported: true,
        signature: 'function rateLimit()',
        contentHash: 'h1',
      },
      // The caller's own enclosing symbol — `service.ts`'s
      // `getPersistentBlast` labels a caller with the nearest persistent
      // symbol at/before its reference line, not the bare toSymbol.
      {
        repoId: repo.id,
        path: 'src/api/public/index.ts',
        name: 'publicRouter',
        kind: 'function',
        line: 20,
        endLine: 30,
        exported: true,
        signature: 'function publicRouter()',
        contentHash: 'h2',
      },
    ]);

    // A real import edge only for the cross-file caller — there is
    // deliberately NO `src/lib/rate.ts -> src/lib/rate.ts` self-edge, because
    // a file never imports itself. This is what makes the self-caller
    // guarantee hold: `resolveReferences`'s join requires an edge from the
    // reference's own file to the declaring file.
    await pg.handle.db.insert(t.fileEdges).values([
      { repoId: repo.id, fromFile: 'src/api/public/index.ts', toFile: 'src/lib/rate.ts' },
    ]);

    // Both references start unresolved (decl_file NULL), exactly as the
    // indexer leaves them before `resolveReferences` runs — one cross-file
    // (resolvable via the edge above), one same-file (no edge to resolve
    // through, since there's no self-edge).
    await pg.handle.db.insert(t.references).values([
      { repoId: repo.id, fromPath: 'src/api/public/index.ts', toSymbol: 'rateLimit', line: 23, declFile: null },
      { repoId: repo.id, fromPath: 'src/lib/rate.ts', toSymbol: 'rateLimit', line: 5, declFile: null },
    ]);

    await repoIntelRepo.resolveReferences(repo.id, { reset: false });

    // Confirm the resolution outcome directly at the repository level: the
    // same-file reference's decl_file stayed NULL (never selected by
    // `getResolvedCallers`'s `inArray(declFile, declFiles)`), independent of
    // whatever the route/blast layer does with the result.
    const resolvedRows = await pg.handle.db
      .select({ fromPath: t.references.fromPath, declFile: t.references.declFile })
      .from(t.references)
      .where(eq(t.references.repoId, repo.id));
    const sameFileRow = resolvedRows.find((r) => r.fromPath === 'src/lib/rate.ts');
    expect(sameFileRow?.declFile).toBeNull();
    const crossFileRow = resolvedRows.find((r) => r.fromPath === 'src/api/public/index.ts');
    expect(crossFileRow?.declFile).toBe('src/lib/rate.ts');

    // `getResolvedCallers` inner-joins `file_rank` on every caller `fromPath`
    // — seed it for both files so the same-file row's absence from the
    // response is attributable only to its unresolved decl_file, not to a
    // missing file_rank row.
    await pg.handle.db.insert(t.fileRank).values([
      { repoId: repo.id, filePath: 'src/api/public/index.ts', pagerank: 0.8, hotness: 0, rank: 0.8, percentile: 90 },
      { repoId: repo.id, filePath: 'src/lib/rate.ts', pagerank: 0.9, hotness: 0, rank: 0.9, percentile: 95 },
    ]);

    await repoIntelRepo.upsertIndexState({
      repoId: repo.id,
      lastIndexedSha: 'abc123',
      indexerVersion: 2,
      status: 'full',
      filesIndexed: 2,
      filesSkipped: 0,
      stats: {},
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadiusResponse.parse(res.json());

    expect(parsed.downstream).toHaveLength(1);
    const group = parsed.downstream[0]!;
    expect(group.symbol).toBe('rateLimit');
    expect(group.callers).toEqual([{ name: 'publicRouter', file: 'src/api/public/index.ts', line: 23 }]);
    expect(group.callers.some((c) => c.file === 'src/lib/rate.ts')).toBe(false);

    await app.close();
  });

  it('changed files not yet in the index (new files) are surfaced via files/summary instead of "no downstream callers" (PR #218 bug)', async () => {
    const app = await appWith();
    // Two changed files: one known to the index (has symbols + a file_rank
    // row), one brand new (no file_rank row at all) — reproduces the PR #218
    // report where changed files are absent from `symbols`/`file_rank`.
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId, [
      'src/lib/rate.ts',
      'src/lib/new-file.ts',
    ]);
    const repoIntelRepo = new RepoIntelRepository(pg.handle.db);

    await repoIntelRepo.insertSymbols([
      {
        repoId: repo.id,
        path: 'src/lib/rate.ts',
        name: 'rateLimit',
        kind: 'function',
        line: 1,
        endLine: 10,
        exported: true,
        signature: 'function rateLimit()',
        contentHash: 'h1',
      },
    ]);
    await pg.handle.db.insert(t.fileRank).values([
      { repoId: repo.id, filePath: 'src/lib/rate.ts', pagerank: 0.9, hotness: 0, rank: 0.9, percentile: 95 },
    ]);
    await repoIntelRepo.upsertIndexState({
      repoId: repo.id,
      lastIndexedSha: 'abc123',
      indexerVersion: 2,
      status: 'full',
      filesIndexed: 1,
      filesSkipped: 0,
      stats: {},
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadiusResponse.parse(res.json());

    expect(parsed.degraded).toBe(false);
    expect(parsed.files).toEqual({ changed: 2, indexed: 1 });
    expect(parsed.indexed_branch).toBe('main');
    expect(parsed.summary).toContain("1 of 2 changed files aren't in the index built from main yet.");

    await app.close();
  });

  it('a PR in a repo without an index row is degraded (no_data) with an empty downstream', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, ['src/lib/rate.ts']);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadiusResponse.parse(res.json());
    expect(parsed.degraded).toBe(true);
    expect(parsed.reason).toBe('no_data');
    expect(parsed.downstream).toEqual([]);
    expect(parsed.files).toEqual({ changed: 1, indexed: 0 });
    // `indexed_branch` is the repo's own default branch (schema default
    // 'main'), independent of whether the index itself is usable.
    expect(parsed.indexed_branch).toBe('main');

    await app.close();
  });

  it('404s for an unknown PR uuid with a not_found error envelope', async () => {
    const app = await appWith();
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/blast',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('404s for a PR that belongs to a different workspace', async () => {
    const app = await appWith();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-blast-ws' }).returning();
    // A PR seeded under a workspace other than the request context's default
    // workspace — the route must not leak it, even though the PR id itself is
    // a real, existing row (R1: unknown-or-foreign both 404).
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id, ['src/lib/rate.ts']);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('422s for a non-uuid :id', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: '/pulls/abc/blast' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
