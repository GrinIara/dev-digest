import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills Lab — CRUD + version history + delete cascade. Covers: create seeds
 * v1, a body-changing PATCH bumps the version and records the given
 * change_summary (defaulting when omitted), toggling `enabled` alone does
 * NOT bump the version, versions list newest-first, and delete cascades
 * skill_versions (and agent_skills, via the DB FK) so no orphaned rows remain.
 */
d('skills CRUD + versions', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Security Rubric',
    description: 'Flags common security issues',
    type: 'security' as const,
    body: 'Check for SQL injection and XSS.',
  };

  it('POST /skills creates a skill and seeds version 1', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name: 'Security Rubric',
      type: 'security',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      skill_id: skill.id,
      version: 1,
      body: createBody.body,
      change_summary: 'Initial version',
    });
    await app.close();
  });

  it('PATCH with a new body bumps the version and records change_summary', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    const skillId = created.json().id as string;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/skills/${skillId}`,
      payload: { body: 'Also check for CSRF.', change_summary: 'Added CSRF check' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      body: 'Also check for CSRF.',
      change_summary: 'Added CSRF check',
    });
    expect(versions[1].body).toBe(createBody.body);
    await app.close();
  });

  it('PATCH with a body change but no change_summary defaults to a generic note', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    await app.inject({
      method: 'PATCH',
      url: `/skills/${skillId}`,
      payload: { body: 'Updated body, no summary given.' },
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions[0].change_summary).toBe('Updated skill');
    await app.close();
  });

  it('toggling enabled alone does NOT create a new version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/skills/${skillId}`,
      payload: { enabled: false },
    });
    expect(patched.json()).toMatchObject({ enabled: false, version: 1 });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('DELETE /skills/:id removes the skill and cascades skill_versions', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    await app.inject({
      method: 'PATCH',
      url: `/skills/${skillId}`,
      payload: { body: 'v2 body' },
    });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);
    const remainingVersions = await db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId));
    expect(remainingVersions).toHaveLength(0);
    await app.close();
  });

  it('DELETE on an unknown skill 404s', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'DELETE', url: `/skills/${ghost}` })).statusCode).toBe(404);
    await app.close();
  });

  it('GET /skills/:id/token-count returns a positive token count', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/token-count` });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('POST /skills/import parses .md frontmatter without inserting anything', async () => {
    const app = await makeApp();
    const md = ['---', 'name: Imported Skill', 'description: from markdown', '---', 'The body.'].join(
      '\n',
    );
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { kind: 'markdown', content: md },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      name: 'Imported Skill',
      description: 'from markdown',
      body: 'The body.',
    });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.find((s: { name: string }) => s.name === 'Imported Skill')).toBeUndefined();
    await app.close();
  });

  it('skills are workspace-scoped: another tenant cannot read them', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills-ws' }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign skill',
        description: 'x',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    expect((await app.inject({ method: 'GET', url: `/skills/${foreign!.id}` })).statusCode).toBe(
      404,
    );
    await app.close();
  });
});
