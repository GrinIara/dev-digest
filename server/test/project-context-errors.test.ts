/**
 * Hardening of the project-context service around adapter failures:
 *  - resolveForRun treats a path that fails confinement as unreadable (PV-1)
 *  - unexpected fs/git errors never reach the response body (NMV-2)
 */
import { describe, it, expect, vi } from 'vitest';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { AppError } from '../src/platform/errors.js';
import { RepoDocPathError } from '../src/adapters/repo-docs/port.js';
import type { RepoDocs } from '../src/adapters/repo-docs/port.js';
import type { ProjectContextRepository } from '../src/modules/project-context/repository.js';
import type { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import type { Container } from '../src/platform/container.js';

const WS = 'ws-1';
const LEAK = "EACCES: permission denied, lstat '/var/devdigest/clones/acme/api/specs/a.md'";
const REPO = { id: 'r1', owner: 'acme', name: 'api', clonePath: '/mock/clone' };

function makeService(repoDocs: Partial<RepoDocs>, paths: string[] = []) {
  const container = {
    db: {},
    repoDocs: { clonePathFor: () => '/x', listMarkdown: async () => [], modifiedPaths: async () => [], ...repoDocs },
    tokenizer: { count: (t: string) => t.length },
    config: { projectContextDirs: ['specs', 'docs', 'insights'] },
  } as unknown as Container;
  const service = new ProjectContextService(container);
  (service as unknown as { repo: Partial<ProjectContextRepository> }).repo = {
    getRepoInWorkspace: async () => ({ ...REPO, defaultBranch: 'main' }),
    listAgentPaths: async () => paths,
    usedByForRepo: async () => new Map(),
  } as unknown as Partial<ProjectContextRepository>;
  return service;
}

describe('resolveForRun path confinement (PV-1)', () => {
  it('skips a path that fails confinement and keeps the other docs', async () => {
    const service = makeService(
      {
        read: async (_r, path) => {
          if (path === '../README.md') throw new RepoDocPathError('Invalid doc path', 'invalid');
          return { ok: true, text: 'hello', size: 5, mtimeMs: 1 };
        },
      },
      ['../README.md', 'specs/a.md'],
    );
    const res = await service.resolveForRun({ workspaceId: WS, agentId: 'a1', repo: REPO, enabledSkills: [] });
    expect(res.status).toBe('resolved');
    if (res.status !== 'resolved') return;
    expect(res.docs.map((d) => d.path)).toEqual(['specs/a.md']);
    expect(res.skipped).toEqual([{ path: '../README.md', reason: 'unreadable' }]);
  });
});

describe('adapter error masking (NMV-2)', () => {
  const fsFail = async (): Promise<never> => {
    throw Object.assign(new Error(LEAK), { code: 'EACCES' });
  };

  async function expectMasked(p: Promise<unknown>, log: { error: ReturnType<typeof vi.fn> }) {
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).not.toContain('/var/devdigest');
    expect((err as AppError).message).toBe("Couldn't access repository documents");
    expect(log.error).toHaveBeenCalledTimes(1);
  }

  it('listDocs hides an fs error from modifiedPaths and logs the original', async () => {
    const log = { error: vi.fn() };
    const service = makeService({ modifiedPaths: fsFail });
    await expectMasked(service.listDocs(WS, 'r1', log), log);
  });

  it('getDoc hides an fs error from discovery reads', async () => {
    const log = { error: vi.fn() };
    const service = makeService({
      listMarkdown: async () => [{ path: 'specs/a.md', size: 1, mtimeMs: 1 }],
      read: fsFail,
    });
    await expectMasked(service.getDoc(WS, 'r1', 'specs/a.md', log), log);
  });

  it('saveDoc hides an fs error from write', async () => {
    const log = { error: vi.fn(), info: vi.fn() };
    const service = makeService({
      listMarkdown: async () => [{ path: 'specs/a.md', size: 1, mtimeMs: 1 }],
      read: async () => ({ ok: true, text: 'x', size: 1, mtimeMs: 1 }),
      write: fsFail,
    });
    await expectMasked(service.saveDoc(WS, 'r1', 'specs/a.md', 'new', log), log);
  });

  it('assertResyncable hides an fs/git error from modifiedPaths', async () => {
    const log = { error: vi.fn() };
    const container = {
      db: {},
      repoDocs: { modifiedPaths: fsFail },
      config: { projectContextDirs: ['specs'] },
    } as unknown as Container;
    const service = new RepoIntelService(container);
    (service as unknown as { repo: Partial<RepoIntelRepository> }).repo = {
      getRepoBasicsInWorkspace: async () => ({ ...REPO, defaultBranch: 'main' }),
    } as unknown as Partial<RepoIntelRepository>;
    await expectMasked(service.assertResyncable(WS, 'r1', { discardLocalEdits: false, log }), log);
  });
});
