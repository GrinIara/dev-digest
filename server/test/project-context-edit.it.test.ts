import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
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
import { FsRepoDocs } from '../src/adapters/repo-docs/index.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import type { GitClient } from '@devdigest/shared';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
const SPEC = '.devdigest/specs/a.md';
const DIFF = `diff --git a/${SPEC} b/${SPEC}
--- a/${SPEC}
+++ b/${SPEC}
@@ -1,1 +1,2 @@
 # spec a
+PR-ONLY-LINE`;

let seq = 0;

d('project-context local doc save + resync guard (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'pc-edit-'));
  });
  afterEach(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  async function appWith(git: GitClient = new MockGitClient({ diff: DIFF })) {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const github = new MockGitHubClient();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        embedder: new MockEmbedder(),
        git,
        github,
        llm: { openai: llm },
        repoDocs: new FsRepoDocs(cloneDir),
        tokenizer: new TiktokenTokenizer(),
      },
    });
    return { app, llm, github, git };
  }
  type App = Awaited<ReturnType<typeof appWith>>['app'];

  async function put(root: string, rel: string, content: string) {
    const abs = join(root, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content);
  }

  /** Repo row + a git clone on disk whose `origin` is a bare remote holding the same commit. */
  async function makeRepo(workspace = workspaceId) {
    const name = `pce-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: workspace,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        defaultBranch: 'main',
        clonePath: join(cloneDir, 'acme', name),
      })
      .returning();
    const root = join(cloneDir, 'acme', name);
    await put(root, SPEC, '# spec a');
    await put(root, 'docs/b.md', '# doc b');
    await put(root, 'README.md', '# root readme');
    await put(root, 'server/README.md', '# server readme');
    await put(root, 'src/app.ts', 'export {};');
    const git = simpleGit(root);
    await git.raw(['init', '-b', 'main']);
    await git.addConfig('user.email', 't@t.t');
    await git.addConfig('user.name', 't');
    await git.add('.');
    await git.commit('init');
    const remote = join(cloneDir, `${name}-remote.git`);
    await simpleGit(cloneDir).raw(['clone', '--bare', root, remote]);
    await git.addRemote('origin', remote);
    await git.fetch(['origin', 'main']);
    return { repo: repo!, root, git };
  }

  const save = (app: App, repoId: string, path: string, content: string) =>
    app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(path)}`,
      payload: { content },
    });
  const getDoc = (app: App, repoId: string, path: string) =>
    app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(path)}` });
  const list = async (app: App, repoId: string) =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` })).json() as {
      docs: { path: string; tokens: number; locally_modified: boolean }[];
    };

  it('AC-53: save then GET returns the new text and tokens change', async () => {
    const { app } = await appWith();
    const { repo, root } = await makeRepo();
    const before = (await getDoc(app, repo.id, SPEC)).json();
    const text = '# spec a\n' + 'more words here to change the token count. '.repeat(20);
    const res = await save(app, repo.id, SPEC, text);
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe(text);
    const after = (await getDoc(app, repo.id, SPEC)).json();
    expect(after.content).toBe(text);
    expect(after.tokens).not.toBe(before.tokens);
    expect(await readFile(join(root, SPEC), 'utf8')).toBe(text);
    await app.close();
  });

  it('AC-54: traversal, a new file and a non-doc path are rejected with 422 and change nothing', async () => {
    const { app } = await appWith();
    const { repo, root } = await makeRepo();
    const listBefore = await list(app, repo.id);
    for (const path of ['../x.md', '.devdigest/specs/new.md', 'src/app.ts']) {
      const res = await save(app, repo.id, path, 'HACKED');
      expect(res.statusCode).toBe(422);
    }
    expect(await list(app, repo.id)).toEqual(listBefore);
    expect(await readFile(join(root, 'src/app.ts'), 'utf8')).toBe('export {};');
    await expect(readFile(join(root, '.devdigest/specs/new.md'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(cloneDir, 'acme', 'x.md'), 'utf8')).rejects.toThrow();
    await app.close();
  });

  it('D1: saving server/README.md is allowed', async () => {
    const { app } = await appWith();
    const { repo } = await makeRepo();
    const res = await save(app, repo.id, 'server/README.md', '# edited readme');
    expect(res.statusCode).toBe(200);
    expect((await getDoc(app, repo.id, 'server/README.md')).json().content).toBe('# edited readme');
    await app.close();
  });

  it('AC-55: save does not move HEAD or touch the LLM / GitHub', async () => {
    const { app, llm, github, git } = await appWith();
    const { repo, git: repoGit } = await makeRepo();
    const head = (await repoGit.revparse(['HEAD'])).trim();
    expect((await save(app, repo.id, SPEC, '# edited')).statusCode).toBe(200);
    expect((await repoGit.revparse(['HEAD'])).trim()).toBe(head);
    expect(llm.calls).toEqual([]);
    expect(github.posted).toEqual([]);
    expect(github.openedPrs).toEqual([]);
    expect(github.committed).toEqual([]);
    expect(github.createdComments).toEqual([]);
    expect((git as MockGitClient).syncs).toEqual([]);
    await app.close();
  });

  it('AC-56: a run after the save injects the edited text', async () => {
    const { app } = await appWith();
    const { repo } = await makeRepo();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
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
      path: SPEC,
      additions: 1,
      deletions: 0,
      patch: '@@ -1,1 +1,2 @@\n # spec a\n+PR-ONLY-LINE',
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `A-${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'reviewer' },
      })
    ).json() as { id: string };
    const attached = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context?repo_id=${repo.id}`,
      payload: { paths: [SPEC] },
    });
    expect(attached.statusCode).toBe(200);
    expect((await save(app, repo.id, SPEC, '# spec a\nEDITED-LINE-XYZ')).statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runId = (res.json() as { runs: { run_id: string }[] }).runs[0]!.run_id;
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    const trace = await waitForRunTrace(app, runId);
    expect(trace.prompt_assembly.specs).toContain('EDITED-LINE-XYZ');
    await app.close();
  });

  it('AC-57: only the edited path is locally_modified', async () => {
    const { app } = await appWith();
    const { repo } = await makeRepo();
    expect((await list(app, repo.id)).docs.every((x) => !x.locally_modified)).toBe(true);
    await save(app, repo.id, SPEC, '# edited');
    const flagged = (await list(app, repo.id)).docs.filter((x) => x.locally_modified).map((x) => x.path);
    expect(flagged).toEqual([SPEC]);
    await app.close();
  });

  it('AC-59: resync without the flag is 409 local_edits, enqueues nothing, keeps the edit', async () => {
    const { app, git } = await appWith();
    const { repo, root } = await makeRepo();
    await save(app, repo.id, SPEC, '# locally edited');
    const jobsBefore = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.workspaceId, workspaceId));

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/resync` });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('local_edits');
    expect(body.error.details.paths).toEqual([SPEC]);
    const jobsAfter = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.workspaceId, workspaceId));
    expect(jobsAfter.length).toBe(jobsBefore.length);
    expect((git as MockGitClient).syncs).toEqual([]);
    expect(await readFile(join(root, SPEC), 'utf8')).toBe('# locally edited');
    await app.close();
  });

  it('AC-60: ?discard_local_edits=true is 202 and the sync restores the committed doc', async () => {
    const real = new SimpleGitClient(cloneDir);
    const syncSpy = vi.spyOn(real, 'sync');
    const { app } = await appWith(real);
    const { repo, root } = await makeRepo();
    await save(app, repo.id, SPEC, '# locally edited');

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/resync?discard_local_edits=true` });
    expect(res.statusCode).toBe(202);
    await vi.waitFor(async () => expect(await readFile(join(root, SPEC), 'utf8')).toBe('# spec a'), {
      timeout: 15_000,
      interval: 100,
    });
    expect(syncSpy).toHaveBeenCalled();
    const doc = (await getDoc(app, repo.id, SPEC)).json();
    expect(doc.content).toBe('# spec a');
    expect(doc.locally_modified).toBe(false);
    await app.close();
  });

  it('REC-6: resync of another workspace\'s repo is 404', async () => {
    const { app } = await appWith();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const { repo } = await makeRepo(other!.id);
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/resync` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
