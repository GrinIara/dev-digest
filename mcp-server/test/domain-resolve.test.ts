import { describe, expect, it, vi } from 'vitest';
import { Resolver } from '../src/domain/resolve.js';
import { ToolError } from '../src/domain/tool-result.js';
import type { AgentLite, DevDigestApi, PullLite, RepoLite } from '../src/domain/ports.js';

const AGENTS: AgentLite[] = [
  { id: 'agent-1', name: 'General Reviewer', description: 'd', model: 'm', enabled: true },
  { id: 'agent-2', name: 'Security Reviewer', description: 'd', model: 'm', enabled: true },
  { id: 'agent-3', name: 'general reviewer', description: 'd', model: 'm', enabled: true }, // ambiguous by name
];

const REPOS: RepoLite[] = [
  { id: 'repo-1', full_name: 'acme/payments-api' },
  { id: 'repo-2', full_name: 'acme/other' },
];

const PULLS: PullLite[] = [
  { id: 'pr-1', number: 482 },
  { id: 'pr-2', number: 100 },
];

function fakeApi(overrides: Partial<DevDigestApi> = {}): DevDigestApi {
  return {
    listAgents: vi.fn().mockResolvedValue(AGENTS),
    listRepos: vi.fn().mockResolvedValue(REPOS),
    listPulls: vi.fn().mockResolvedValue(PULLS),
    startReview: vi.fn(),
    listRuns: vi.fn(),
    listReviews: vi.fn(),
    listConventions: vi.fn(),
    ...overrides,
  };
}

describe('Resolver.agent', () => {
  it('resolves by exact id', async () => {
    const resolver = new Resolver(fakeApi());
    const agent = await resolver.agent('agent-2');
    expect(agent.name).toBe('Security Reviewer');
  });

  it('resolves by exact, case-insensitive name', async () => {
    const resolver = new Resolver(fakeApi());
    const agent = await resolver.agent('security reviewer');
    expect(agent.id).toBe('agent-2');
  });

  it('throws a not-found ToolError mentioning list_agents', async () => {
    const resolver = new Resolver(fakeApi());
    await expect(resolver.agent('nope')).rejects.toThrow(ToolError);
    await expect(resolver.agent('nope')).rejects.toThrow(/list_agents/);
  });

  it('throws an ambiguous-name ToolError listing the matching ids', async () => {
    const resolver = new Resolver(fakeApi());
    await expect(resolver.agent('general reviewer')).rejects.toThrow(/matches 2 agents/);
    await expect(resolver.agent('general reviewer')).rejects.toThrow(/agent-1/);
    await expect(resolver.agent('general reviewer')).rejects.toThrow(/agent-3/);
  });
});

describe('Resolver.repo', () => {
  it('resolves an exact, case-insensitive full_name', async () => {
    const resolver = new Resolver(fakeApi());
    const repo = await resolver.repo('ACME/Payments-API');
    expect(repo.id).toBe('repo-1');
  });

  it('throws a not-found ToolError listing known repos', async () => {
    const resolver = new Resolver(fakeApi());
    await expect(resolver.repo('acme/missing')).rejects.toThrow(/acme\/payments-api/);
    await expect(resolver.repo('acme/missing')).rejects.toThrow(/DevDigest home page/);
  });
});

describe('Resolver.pull', () => {
  it('resolves a known PR number to its id', async () => {
    const resolver = new Resolver(fakeApi());
    const prId = await resolver.pull('repo-1', 'acme/payments-api', 482);
    expect(prId).toBe('pr-1');
  });

  it('throws a not-found ToolError mentioning GitHub token / Settings', async () => {
    const resolver = new Resolver(fakeApi());
    await expect(resolver.pull('repo-1', 'acme/payments-api', 999)).rejects.toThrow(
      /GitHub token/,
    );
    await expect(resolver.pull('repo-1', 'acme/payments-api', 999)).rejects.toThrow(/#482/);
  });

  it('caches a resolved (repoId, number) pair for the process lifetime — a hit makes zero extra listPulls calls', async () => {
    const api = fakeApi();
    const resolver = new Resolver(api);
    await resolver.pull('repo-1', 'acme/payments-api', 482);
    expect(api.listPulls).toHaveBeenCalledTimes(1);
    await resolver.pull('repo-1', 'acme/payments-api', 482);
    expect(api.listPulls).toHaveBeenCalledTimes(1); // no extra call on cache hit
  });
});
