import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { eq } from 'drizzle-orm';
import { renderProjectContextDoc, renderProjectContextHeader } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import { FsRepoDocs } from '../src/adapters/repo-docs/index.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

d('project-context (Testcontainers pg)', () => {
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
    cloneDir = await mkdtemp(join(tmpdir(), 'pc-clones-'));
  });
  afterEach(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', {}) },
        repoDocs: new FsRepoDocs(cloneDir),
        tokenizer: new TiktokenTokenizer(),
      },
    });
  }

  async function put(root: string, rel: string, content: string) {
    const abs = join(root, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content);
  }

  /** Repo row + a git-initialised clone fixture on disk. */
  async function makeRepo(opts: { cloned?: boolean; workspace?: string } = {}) {
    const { cloned = true, workspace = workspaceId } = opts;
    const name = `pc-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: workspace,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: cloned ? join(cloneDir, 'acme', name) : null,
      })
      .returning();
    const root = join(cloneDir, 'acme', name);
    if (cloned) {
      await put(root, '.devdigest/specs/a.md', '# spec a');
      await put(root, 'docs/b.md', '# doc b');
      await put(root, 'docs/missing-later.md', '# soon gone');
      await put(root, 'insights/c.md', '# insight c');
      await put(root, 'README.md', '# root readme');
      await put(root, 'server/README.md', '# server readme');
      await put(root, 'src/notes.md', '# not a doc');
      await put(root, 'node_modules/x/docs/d.md', '# vendored');
      await put(root, 'node_modules/x/README.md', '# vendored readme');
      const git = simpleGit(root);
      await git.init();
      await git.addConfig('user.email', 't@t.t');
      await git.addConfig('user.name', 't');
      await git.add('.');
      await git.commit('init');
    }
    return { repo: repo!, root };
  }

  async function makeAgent(app: Awaited<ReturnType<typeof appWith>>, name = 'A') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `${name}-${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'reviewer' },
    });
    return res.json() as { id: string; version: number };
  }

  async function makeSkill(app: Awaited<ReturnType<typeof appWith>>, enabled = true) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `S-${seq++}`, description: 'd', type: 'custom', body: 'Body text.' },
    });
    const skill = res.json() as { id: string; version: number };
    if (!enabled) await pg.handle.db.update(t.skills).set({ enabled: false }).where(eq(t.skills.id, skill.id));
    return skill;
  }

  const put_ = (app: Awaited<ReturnType<typeof appWith>>, kind: 'agents' | 'skills', id: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/${kind}/${id}/context?repo_id=${repoId}`, payload: { paths } });
  const get_ = (app: Awaited<ReturnType<typeof appWith>>, kind: 'agents' | 'skills', id: string, repoId: string) =>
    app.inject({ method: 'GET', url: `/${kind}/${id}/context?repo_id=${repoId}` });

  it('AC-1 (deviation D1): lists folder docs and READMEs, excludes vendored and non-root docs', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/docs` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const byPath = new Map<string, { type: string }>(body.docs.map((x: { path: string; type: string }) => [x.path, x]));
    expect(byPath.has('.devdigest/specs/a.md')).toBe(true);
    expect(byPath.has('docs/b.md')).toBe(true);
    expect(byPath.has('insights/c.md')).toBe(true);
    expect(byPath.get('README.md')?.type).toBe('docs');
    expect(byPath.get('server/README.md')?.type).toBe('docs');
    expect(byPath.has('node_modules/x/docs/d.md')).toBe(false);
    expect(byPath.has('node_modules/x/README.md')).toBe(false);
    expect(byPath.has('src/notes.md')).toBe(false);
    expect(body.roots).toEqual(['specs/', 'docs/', 'insights/', 'README.md']);
    await app.close();
  });

  it('AC-4: a doc attached to agent A and via an enabled skill bound to agent B has used_by 2', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const a = await makeAgent(app);
    const b = await makeAgent(app);
    const skill = await makeSkill(app);
    await pg.handle.db.insert(t.agentSkills).values({ agentId: b.id, skillId: skill.id, order: 0 });
    expect((await put_(app, 'agents', a.id, repo.id, ['docs/b.md'])).statusCode).toBe(200);
    expect((await put_(app, 'skills', skill.id, repo.id, ['docs/b.md'])).statusCode).toBe(200);
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/docs` })).json();
    expect(list.docs.find((x: { path: string }) => x.path === 'docs/b.md').used_by).toBe(2);
    await app.close();
  });

  it('AC-7: a repo without a clone returns 409 not_cloned', async () => {
    const app = await appWith();
    const { repo } = await makeRepo({ cloned: false });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/docs` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('not_cloned');
    await app.close();
  });

  it('AC-11: a repo of another workspace is 404', async () => {
    const app = await appWith();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const { repo } = await makeRepo({ workspace: other!.id });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/docs` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('AC-13 + AC-15: PUT then GET keeps the set and order, including README.md', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const agent = await makeAgent(app);
    const paths = ['server/README.md', '.devdigest/specs/a.md', 'docs/b.md'];
    expect((await put_(app, 'agents', agent.id, repo.id, paths)).statusCode).toBe(200);
    const body = (await get_(app, 'agents', agent.id, repo.id)).json();
    expect(body.attached.map((r: { path: string }) => r.path)).toEqual(paths);
    expect(body.attached.every((r: { status: string }) => r.status === 'present')).toBe(true);
    await app.close();
  });

  it('AC-23: detaching a missing path while another missing path stays returns 200', async () => {
    const app = await appWith();
    const { repo, root } = await makeRepo();
    const agent = await makeAgent(app);
    await put_(app, 'agents', agent.id, repo.id, ['docs/b.md', 'docs/missing-later.md', 'insights/c.md']);
    await rm(join(root, 'docs/b.md'));
    await rm(join(root, 'docs/missing-later.md'));
    const res = await put_(app, 'agents', agent.id, repo.id, ['docs/missing-later.md', 'insights/c.md']);
    expect(res.statusCode).toBe(200);
    const rows = res.json().attached as { path: string; status: string }[];
    expect(rows.find((r) => r.path === 'docs/missing-later.md')?.status).toBe('missing');
    expect(rows.map((r) => r.path)).not.toContain('docs/b.md');
    await app.close();
  });

  it('AC-26: an attachment for repo A is absent for repo B', async () => {
    const app = await appWith();
    const { repo: a } = await makeRepo();
    const { repo: b } = await makeRepo();
    const agent = await makeAgent(app);
    await put_(app, 'agents', agent.id, a.id, ['docs/b.md']);
    const body = (await get_(app, 'agents', agent.id, b.id)).json();
    expect(body.attached).toEqual([]);
    await app.close();
  });

  it('AC-27: agent/skill version and versions list are unchanged after PUT', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const agent = await makeAgent(app);
    const skill = await makeSkill(app);
    const agentVersions = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json();
    const skillVersions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    await put_(app, 'agents', agent.id, repo.id, ['docs/b.md']);
    await put_(app, 'skills', skill.id, repo.id, ['docs/b.md']);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version).toBe(agent.version);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().version).toBe(skill.version);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json()).toEqual(agentVersions);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json()).toEqual(skillVersions);
    await app.close();
  });

  it('AC-28: traversal path and unknown new path are 422 with the set unchanged', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const agent = await makeAgent(app);
    await put_(app, 'agents', agent.id, repo.id, ['docs/b.md']);
    const traversal = await put_(app, 'agents', agent.id, repo.id, ['docs/b.md', '../secrets.md']);
    expect(traversal.statusCode).toBe(422);
    const unknown = await put_(app, 'agents', agent.id, repo.id, ['docs/b.md', 'docs/nope.md']);
    expect(unknown.statusCode).toBe(422);
    const notDoc = await put_(app, 'agents', agent.id, repo.id, ['src/notes.md']);
    expect(notDoc.statusCode).toBe(422);
    const dup = await put_(app, 'agents', agent.id, repo.id, ['docs/b.md', 'docs/b.md']);
    expect(dup.statusCode).toBe(422);
    const body = (await get_(app, 'agents', agent.id, repo.id)).json();
    expect(body.attached.map((r: { path: string }) => r.path)).toEqual(['docs/b.md']);
    await app.close();
  });

  it('AC-29: skill PUT/GET persists', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const skill = await makeSkill(app);
    expect((await put_(app, 'skills', skill.id, repo.id, ['insights/c.md', 'README.md'])).statusCode).toBe(200);
    const body = (await get_(app, 'skills', skill.id, repo.id)).json();
    expect(body.attached.map((r: { path: string }) => r.path)).toEqual(['insights/c.md', 'README.md']);
    await app.close();
  });

  it('AC-31: a disabled skill contributes no inherited rows; an enabled one does', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const agent = await makeAgent(app);
    const off = await makeSkill(app, false);
    const on = await makeSkill(app, true);
    await pg.handle.db.insert(t.agentSkills).values([
      { agentId: agent.id, skillId: off.id, order: 0 },
      { agentId: agent.id, skillId: on.id, order: 1 },
    ]);
    await put_(app, 'skills', off.id, repo.id, ['docs/b.md']);
    let body = (await get_(app, 'agents', agent.id, repo.id)).json();
    expect(body.inherited).toEqual([]);
    await put_(app, 'skills', on.id, repo.id, ['insights/c.md']);
    body = (await get_(app, 'agents', agent.id, repo.id)).json();
    expect(body.inherited.map((r: { path: string; skill_id: string }) => [r.path, r.skill_id])).toEqual([
      ['insights/c.md', on.id],
    ]);
    await app.close();
  });

  it('AC-65: agent total_tokens = header_tokens + sum of attached doc tokens', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const agent = await makeAgent(app);
    await put_(app, 'agents', agent.id, repo.id, ['docs/b.md', 'README.md']);
    const body = (await get_(app, 'agents', agent.id, repo.id)).json();
    const tk = new TiktokenTokenizer();
    const expectDoc = (p: string, text: string) => tk.count(renderProjectContextDoc({ path: p, text }));
    const sum = expectDoc('docs/b.md', '# doc b') + expectDoc('README.md', '# root readme');
    expect(body.header_tokens).toBe(tk.count(renderProjectContextHeader()));
    expect(body.total_tokens).toBe(body.header_tokens + sum);
    expect(body.attached.reduce((n: number, r: { tokens: number }) => n + r.tokens, 0)).toBe(sum);
    await app.close();
  });

  it('GET docs/content returns content and 404 for a non-discovered path', async () => {
    const app = await appWith();
    const { repo } = await makeRepo();
    const ok = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/docs/content?path=docs/b.md` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().content).toBe('# doc b');
    const no = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/docs/content?path=src/notes.md` });
    expect(no.statusCode).toBe(404);
    await app.close();
  });
});
