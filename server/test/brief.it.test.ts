import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
  MockRepoDocs,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...extra } as NodeJS.ProcessEnv);

const PATCH = '@@ -40,3 +40,13 @@\n a\n+b\n c';
const MODEL_OUTPUT = {
  summary: 'Adds rate limiting.',
  risks: [
    { kind: 'k', title: 'Real risk', explanation: 'e', severity: 'high', file_refs: ['src/a.ts:41', 'src/invented.ts'] },
    { kind: 'k', title: 'Invented only', explanation: 'e', severity: 'low', file_refs: ['src/invented.ts'] },
  ],
  review_focus: [
    { file: 'src/a.ts', line: 41, reason: 'ok' },
    { file: 'src/a.ts', line: 900, reason: 'bad line' },
    { file: 'src/nope.ts', line: 1, reason: 'bad file' },
  ],
};

class ThrowingLLM implements LLMProvider {
  readonly id = 'openai' as const;
  async listModels() { return []; }
  async complete(): Promise<never> { throw new Error('boom'); }
  async completeStructured<T>(_r: StructuredRequest<T>): Promise<StructuredResult<T>> { throw new Error('boom'); }
  async embed(): Promise<number[][]> { return []; }
}

let seq = 0;

d('SPEC-2026-09-30-pr-risk-brief (Testcontainers pg)', () => {
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

  async function appWith(opts: {
    llm?: LLMProvider;
    github?: MockGitHubClient;
    docs?: MockRepoDocs;
    noKey?: boolean;
    env?: Record<string, string>;
  } = {}) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { BriefModelOutput: MODEL_OUTPUT } });
    const github = opts.github ?? new MockGitHubClient({ issues: {} });
    const app = await buildApp({
      config: config(opts.env),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github,
        repoDocs: opts.docs ?? new MockRepoDocs({}),
        ...(opts.noKey ? {} : { llm: { openai: llm } }),
      },
    });
    return { app, llm, github };
  }

  async function makePr(body: string, withFiles = true, cloned = true, workspace = workspaceId) {
    const name = `brief-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: workspace, owner: 'acme', name, fullName: `acme/${name}`, clonePath: cloned ? `/mock/${name}` : null })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: workspace, repoId: repo!.id, number: 5, title: 'Add rate limit', author: 'a',
        branch: 'f', base: 'main', headSha: 'sha1', additions: 1, deletions: 0, filesCount: 1,
        status: 'needs_review', body,
      })
      .returning();
    if (withFiles) {
      await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 1, deletions: 0, patch: PATCH });
    }
    return { repo: repo!, pr: pr! };
  }

  const post = (app: Awaited<ReturnType<typeof appWith>>['app'], id: string) =>
    app.inject({ method: 'POST', url: `/pulls/${id}/brief` });
  const get = (app: Awaited<ReturnType<typeof appWith>>['app'], id: string) =>
    app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
  const userMessage = (llm: LLMProvider) => {
    const call = (llm as MockLLMProvider).calls.find((c) => c.method === 'completeStructured');
    const msgs = (call!.req as StructuredRequest<unknown>).messages;
    return msgs.find((m) => m.role === 'user')!.content as string;
  };

  it('AC-2/AC-27/AC-36: generates with the feature model, grounds output, regenerates', async () => {
    const { app, llm } = await appWith();
    const { pr } = await makePr('no links');
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    const { brief, stale } = res.json();
    expect(stale).toBe(false);
    expect(brief.model).toBe('gpt-4.1');
    expect(brief.provider).toBe('openai');
    expect(brief.risks.risks).toHaveLength(1);
    expect(brief.risks.risks[0].file_refs).toEqual(['src/a.ts:41']);
    expect(brief.review_focus).toHaveLength(1);
    expect(brief.dropped).toEqual({ risks: 1, focus: 2 });
    expect((llm as MockLLMProvider).calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const first = (await get(app, pr.id)).json().brief.generated_at;
    await new Promise((r) => setTimeout(r, 5));
    await post(app, pr.id);
    expect((await get(app, pr.id)).json().brief.generated_at > first).toBe(true);
    await app.close();
  });

  it('AC-10/AC-11/AC-53: intent, blast and issue flagged missing without classifying', async () => {
    const { app } = await appWith({ env: { REPO_INTEL_ENABLED: 'false' } });
    const { pr } = await makePr('no links');
    const { brief } = (await post(app, pr.id)).json();
    expect(brief.missing_inputs).toContainEqual({ input: 'intent', status: 'missing', reason: 'not_classified', ref: null });
    expect(brief.missing_inputs).toContainEqual({ input: 'blast', status: 'missing', reason: 'flag_off', ref: null });
    expect(brief.missing_inputs).toContainEqual({ input: 'issue', status: 'missing', reason: 'none_linked', ref: null });
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toBeUndefined();
    await app.close();
  });

  it('AC-12: a partial index is used and flagged partial', async () => {
    const { app } = await appWith();
    const { pr, repo } = await makePr('no links');
    const blastSvc = await import('../src/modules/blast/service.js');
    const spy = vi.spyOn(blastSvc.BlastService.prototype, 'getBlast').mockResolvedValue({
      pr_id: pr.id, changed_symbols: [], summary: 'partial summary',
      downstream: [{ symbol: 's', callers: [{ name: 'c', file: 'src/caller.ts', line: 3 }], endpoints_affected: [], crons_affected: [] }],
      counts: { symbols: 1, callers: 1, endpoints: 0, crons: 0 }, degraded: true, reason: 'index_partial',
      indexed_sha: null, indexed_branch: null, callers_truncated: false,
      limits: { max_callers_per_symbol: 1, bfs_depth: 1 }, facts_by_file: {}, files: { changed: 1, indexed: 0 },
    });
    void repo;
    const { brief } = (await post(app, pr.id)).json();
    spy.mockRestore();
    expect(brief.missing_inputs).toContainEqual({ input: 'blast', status: 'partial', reason: 'index_partial', ref: null });
    expect(brief.blast.downstream[0].callers[0].file).toBe('src/caller.ts');
    await app.close();
  });

  it('AC-13/AC-14/AC-15: specs none_attached, doc_missing, deduped and truncated', async () => {
    const docs = new MockRepoDocs({ 'specs/a.md': 'x'.repeat(9000) });
    const { app } = await appWith({ docs });
    const none = await makePr('b');
    expect((await post(app, none.pr.id)).json().brief.missing_inputs).toContainEqual({
      input: 'specs', status: 'missing', reason: 'none_attached', ref: null,
    });

    const { pr, repo } = await makePr('b');
    const mk = async (name: string) => {
      const [a] = await pg.handle.db.insert(t.agents).values({ workspaceId, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 's' }).returning();
      return a!;
    };
    const a1 = await mk(`a1-${seq}`);
    const a2 = await mk(`a2-${seq}`);
    await pg.handle.db.insert(t.agentContextDocs).values([
      { agentId: a1.id, repoId: repo.id, path: 'specs/a.md', position: 0 },
      { agentId: a2.id, repoId: repo.id, path: 'specs/a.md', position: 0 },
      { agentId: a1.id, repoId: repo.id, path: 'docs/gone.md', position: 1 },
    ]);
    const { brief } = (await post(app, pr.id)).json();
    expect(brief.inputs.specs).toEqual([{ path: 'specs/a.md', truncated: true }]);
    expect(brief.missing_inputs).toContainEqual({ input: 'specs', status: 'missing', reason: 'doc_missing', ref: 'docs/gone.md' });
    await app.close();
  });

  it('AC-17: no stored files -> 409 no_changed_files', async () => {
    const { app } = await appWith();
    const { pr } = await makePr('b', false);
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('no_changed_files');
    await app.close();
  });

  it('AC-35/AC-41: GET makes no LLM or issue calls; stale after head change', async () => {
    const github = new MockGitHubClient({ issues: {} });
    const spy = vi.spyOn(github, 'getIssue');
    const { app, llm } = await appWith({ github });
    const { pr } = await makePr('b');
    expect((await get(app, pr.id)).json()).toEqual({ brief: null, stale: false });
    await post(app, pr.id);
    const before = (llm as MockLLMProvider).calls.length;
    spy.mockClear();
    const res = await get(app, pr.id);
    expect(res.json().stale).toBe(false);
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha2' }).where(eq(t.pullRequests.id, pr.id));
    expect((await get(app, pr.id)).json().stale).toBe(true);
    expect((llm as MockLLMProvider).calls.length).toBe(before);
    expect(spy).not.toHaveBeenCalled();
    await app.close();
  });

  it('AC-38: model failure -> 502 and the previous brief is kept', async () => {
    const ok = await appWith();
    const { pr } = await makePr('b');
    await post(ok.app, pr.id);
    const before = (await get(ok.app, pr.id)).json().brief;
    await ok.app.close();

    const bad = await appWith({ llm: new ThrowingLLM() });
    const res = await post(bad.app, pr.id);
    expect(res.statusCode).toBe(502);
    expect((await get(bad.app, pr.id)).json().brief).toEqual(before);
    await bad.app.close();
  });

  it('AC-39: missing provider key -> configuration error (not 502)', async () => {
    const { app } = await appWith({ noKey: true });
    const { pr } = await makePr('b');
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('config_error');
    await app.close();
  });

  it('AC-40: concurrent generation -> one 200, one 409 brief_in_progress; lock released', async () => {
    const { app } = await appWith();
    const { pr } = await makePr('b');
    const [r1, r2] = await Promise.all([post(app, pr.id), post(app, pr.id)]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const conflict = r1.statusCode === 409 ? r1 : r2;
    expect(conflict.json().error.code).toBe('brief_in_progress');
    expect((await post(app, pr.id)).statusCode).toBe(200);
    await app.close();
  });

  it('AC-47: another workspace / unknown PR -> 404', async () => {
    const { app } = await appWith();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `o-${seq++}`, slug: `o-${seq}` } as never).returning();
    const { pr } = await makePr('b', true, true, other!.id);
    expect((await get(app, pr.id)).statusCode).toBe(404);
    expect((await post(app, pr.id)).statusCode).toBe(404);
    await app.close();
  });

  it('AC-52: same-repo issue goes into an untrusted block; inputs.issues lists it', async () => {
    const github = new MockGitHubClient({ issues: { 12: { number: 12, title: 'Throttle public API', body: 'details', state: 'open' } } });
    const { app, llm } = await appWith({ github });
    const { pr } = await makePr('closes #12');
    const { brief } = (await post(app, pr.id)).json();
    expect(brief.inputs.issues).toEqual([{ ref: '#12', truncated: false }]);
    const msg = userMessage(llm);
    expect(msg).toContain('linked-issue:#12');
    expect(msg).toContain('Throttle public API');
    await app.close();
  });

  it('AC-54: a failing issue fetch is skipped and flagged unreachable (200)', async () => {
    const github = new MockGitHubClient({ issues: { 12: 'error' } });
    const { app } = await appWith({ github });
    const { pr } = await makePr('closes #12');
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.missing_inputs).toContainEqual({ input: 'issue', status: 'missing', reason: 'unreachable', ref: '#12' });
    expect(res.json().brief.inputs.issues).toEqual([]);
    await app.close();
  });

  it('AC-55: a Jira link is never fetched and flagged unsupported', async () => {
    const github = new MockGitHubClient({ issues: {} });
    const spy = vi.spyOn(github, 'getIssue');
    const { app } = await appWith({ github });
    const url = 'https://acme.atlassian.net/browse/X-1';
    const { pr } = await makePr(`see ${url}`);
    const { brief } = (await post(app, pr.id)).json();
    expect(spy).not.toHaveBeenCalled();
    expect(brief.missing_inputs).toContainEqual({ input: 'issue', status: 'missing', reason: 'unsupported', ref: url });
    await app.close();
  });
});
