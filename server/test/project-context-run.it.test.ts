import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockSecretsProvider,
  MockRepoDocs,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// The PR touches specs/a.md only; the injected text must come from the clone.
const DIFF = `diff --git a/specs/a.md b/specs/a.md
--- a/specs/a.md
+++ b/specs/a.md
@@ -1,1 +1,2 @@
 # spec a
+PR-ONLY-LINE`;

const REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

const FILES = {
  'specs/a.md': '# spec a CLONE-CONTENT',
  'specs/old.md': '# old',
  'docs/b.md': '# doc b',
  'docs/secret.md': '# unreadable soon',
  'README.md': '# root readme',
};

let seq = 0;

d('SPEC-2026-09-29-project-context run-time injection (Testcontainers pg)', () => {
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

  async function setup() {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const docs = new MockRepoDocs(FILES);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
        repoDocs: docs,
      },
    });
    return { app, llm, docs };
  }
  type App = Awaited<ReturnType<typeof setup>>['app'];

  async function makeRepoPr(cloned = true) {
    const name = `pcr-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: cloned ? `/mock-clones/acme/${name}` : null,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Spec change',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'body',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'specs/a.md',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,1 +1,2 @@\n # spec a\n+PR-ONLY-LINE',
    });
    return { repo: repo!, pr: pr! };
  }

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `A-${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'reviewer' },
    });
    return res.json() as { id: string };
  }

  async function makeSkill(app: App, enabled = true) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `S-${seq++}`, description: 'd', type: 'custom', body: 'Body text.' },
    });
    const skill = res.json() as { id: string };
    if (!enabled) await pg.handle.db.update(t.skills).set({ enabled: false }).where(eq(t.skills.id, skill.id));
    return skill;
  }

  const attach = (app: App, kind: 'agents' | 'skills', id: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/${kind}/${id}/context?repo_id=${repoId}`, payload: { paths } });

  async function review(app: App, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { runs: { run_id: string }[] }).runs[0]!.run_id;
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const settled = runs.find((r) => r.id === id);
    expect(['done', 'failed', 'cancelled']).toContain(settled?.status);
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, id));
    const trace = await waitForRunTrace(app, id);
    return { run: run!, trace };
  }

  it('AC-32/46/47/65 + D1: injects clone content in effective order, snapshot survives later edits', async () => {
    const { app, docs } = await setup();
    const { repo, pr } = await makeRepoPr();
    const agent = await makeAgent(app);
    expect((await attach(app, 'agents', agent.id, repo.id, ['specs/a.md', 'README.md'])).statusCode).toBe(200);

    const { run, trace } = await review(app, pr.id, agent.id);
    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual(['specs/a.md', 'README.md']);
    expect(trace.specs_missing).toEqual([]);
    for (const p of trace.specs_read) expect(Number.isInteger(trace.specs_tokens![p])).toBe(true);
    expect(trace.prompt_assembly.specs).toContain('# spec a CLONE-CONTENT');
    expect(trace.prompt_assembly.specs).toContain('# root readme');
    expect(trace.prompt_assembly.user).toContain('# spec a CLONE-CONTENT');

    // AC-65
    const ctx = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    const sum = Object.values(trace.specs_tokens!).reduce((n, v) => n + v, 0);
    expect(ctx.total_tokens).toBe(ctx.header_tokens + sum);

    // AC-47
    const before = trace.prompt_assembly.specs;
    docs.files['specs/a.md'] = '# mutated after the run';
    const again = (await app.inject({ method: 'GET', url: `/runs/${run.id}/trace` })).json() as RunTrace;
    expect(again.prompt_assembly.specs).toBe(before);
    await app.close();
  });

  it('AC-31: a disabled skill\'s docs are absent from the trace', async () => {
    const { app } = await setup();
    const { repo, pr } = await makeRepoPr();
    const agent = await makeAgent(app);
    const skill = await makeSkill(app, false);
    await attach(app, 'skills', skill.id, repo.id, ['docs/b.md']);
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });
    const { run, trace } = await review(app, pr.id, agent.id);
    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual([]);
    await app.close();
  });

  it('AC-38/39: LLM call count is unchanged and the summary log line reports N=2', async () => {
    const plain = await setup();
    const a = await makeRepoPr();
    const agentA = await makeAgent(plain.app);
    await review(plain.app, a.pr.id, agentA.id);
    const baseline = plain.llm.calls.length;

    const withDocs = await setup();
    const b = await makeRepoPr();
    const agentB = await makeAgent(withDocs.app);
    await attach(withDocs.app, 'agents', agentB.id, b.repo.id, ['specs/a.md', 'docs/b.md', 'README.md']);
    await review(withDocs.app, b.pr.id, agentB.id);
    expect(withDocs.llm.calls.length).toBe(baseline);

    const c = await makeRepoPr();
    const agentC = await makeAgent(withDocs.app);
    await attach(withDocs.app, 'agents', agentC.id, c.repo.id, ['specs/a.md', 'docs/b.md']);
    const { trace } = await review(withDocs.app, c.pr.id, agentC.id);
    expect(trace.log.some((l) => /^Project context: 2 document\(s\), ≈\d+ tokens attached$/.test(l.msg))).toBe(true);
    await plain.app.close();
    await withDocs.app.close();
  });

  it('AC-40/41/45: deleted or unreadable docs are skipped, the run is done', async () => {
    const { app, docs } = await setup();
    const { repo, pr } = await makeRepoPr();
    const agent = await makeAgent(app);
    await attach(app, 'agents', agent.id, repo.id, ['specs/old.md', 'docs/secret.md', 'docs/b.md']);
    delete docs.files['specs/old.md'];
    docs.unreadable.add('docs/secret.md');

    const { run, trace } = await review(app, pr.id, agent.id);
    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual(['docs/b.md']);
    expect(trace.specs_missing).toEqual(['specs/old.md', 'docs/secret.md']);
    expect(trace.log.some((l) => l.msg === 'Project context: specs/old.md missing in repo — skipped')).toBe(true);
    expect(trace.log.some((l) => l.msg === 'Project context: docs/secret.md unreadable — skipped')).toBe(true);
    expect(trace.prompt_assembly.user).not.toContain('# unreadable soon');
    await app.close();
  });

  it('AC-43: a repo with no clone path still reviews, without a Project context section', async () => {
    const { app } = await setup();
    const { repo, pr } = await makeRepoPr(true);
    const agent = await makeAgent(app);
    await attach(app, 'agents', agent.id, repo.id, ['docs/b.md']);
    await pg.handle.db.update(t.repos).set({ clonePath: null }).where(eq(t.repos.id, repo.id));

    const { run, trace } = await review(app, pr.id, agent.id);
    expect(run.status).toBe('done');
    expect(trace.log.some((l) => l.msg === 'Project context: repository not cloned — skipped')).toBe(true);
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
    await app.close();
  });
});
