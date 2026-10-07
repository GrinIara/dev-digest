/**
 * `RepoIntelService.assertResyncable` — the fail-fast precheck for
 * `POST /repos/:id/resync`.
 *
 * Bug fixed: the route used to always return 202 and enqueue a
 * `RESYNC_JOB_KIND` job even for a repo with no clone. The job handler
 * (`resyncRepo`) degrades to `no_clone` in ~10ms without persisting anything,
 * so `GET /repos/:id/index-state` never advances and the client polls until
 * it times out with no visible error. `assertResyncable` lets the route
 * reject the request synchronously instead.
 */
import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { NotFoundError, ConflictError } from '../src/platform/errors.js';
import type { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import type { Container } from '../src/platform/container.js';

interface Basics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

const WS = 'ws-1';

function makeService(basics: Basics | null, modified: string[] = []) {
  const repo = {
    getRepoBasicsInWorkspace: async (workspaceId: string) => (workspaceId === WS ? basics : null),
  } as unknown as RepoIntelRepository;

  const container = {
    db: {},
    repoDocs: { modifiedPaths: async () => modified },
    config: { projectContextDirs: ['specs', 'docs', 'insights'] },
  } as unknown as Container;
  const service = new RepoIntelService(container);
  (service as unknown as { repo: RepoIntelRepository }).repo = repo;
  return service;
}

const CLONED: Basics = {
  id: 'r1',
  owner: 'acme',
  name: 'payments-api',
  defaultBranch: 'main',
  clonePath: '/mock/clone',
};

describe('RepoIntelService.assertResyncable', () => {
  it('throws NotFoundError for an unknown repo id', async () => {
    const service = makeService(null);
    await expect(service.assertResyncable(WS, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws a 409 ConflictError (repo_not_cloned) when the repo has no clone', async () => {
    const service = makeService({
      id: 'r1',
      owner: 'acme',
      name: 'payments-api',
      defaultBranch: 'main',
      clonePath: null,
    });

    await expect(service.assertResyncable(WS, 'r1')).rejects.toMatchObject({
      code: 'repo_not_cloned',
      statusCode: 409,
    });
    await expect(service.assertResyncable(WS, 'r1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolves for a cloned repo', async () => {
    const service = makeService({
      id: 'r1',
      owner: 'acme',
      name: 'payments-api',
      defaultBranch: 'main',
      clonePath: '/mock/clone',
    });

    await expect(service.assertResyncable(WS, 'r1')).resolves.toBeUndefined();
  });

  it('throws NotFoundError for a repo in another workspace (REC-6)', async () => {
    const service = makeService(CLONED);
    await expect(service.assertResyncable('other-ws', 'r1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws 409 local_edits with details.paths when a discovered doc is modified', async () => {
    const service = makeService(CLONED, ['specs/a.md', 'src/app.ts']);
    await expect(service.assertResyncable(WS, 'r1')).rejects.toMatchObject({
      code: 'local_edits',
      statusCode: 409,
      details: { paths: ['specs/a.md'] },
    });
  });

  it('treats a modified README.md as a local edit (D1)', async () => {
    const service = makeService(CLONED, ['server/README.md']);
    await expect(service.assertResyncable(WS, 'r1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolves with discardLocalEdits: true despite modified docs', async () => {
    const service = makeService(CLONED, ['specs/a.md', 'server/README.md']);
    await expect(
      service.assertResyncable(WS, 'r1', { discardLocalEdits: true }),
    ).resolves.toBeUndefined();
  });

  it('resolves when only non-doc files are modified', async () => {
    const service = makeService(CLONED, ['src/app.ts']);
    await expect(service.assertResyncable(WS, 'r1')).resolves.toBeUndefined();
  });
});
