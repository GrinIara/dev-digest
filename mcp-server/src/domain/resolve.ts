import type { AgentLite, DevDigestApi, RepoLite } from './ports.js';
import { ToolError } from './tool-result.js';

const MAX_LISTED = 10;

/**
 * Resolves the human-friendly identifiers every tool takes (`agent` id-or-name,
 * `repo` "owner/name", `pr` number) into the internal uuids the API needs.
 * Constructed once at startup (composition root) and shared by every tool
 * call, so `pull()`'s `(repoId, number) → prId` cache lives for the process
 * lifetime (§0.1: `GET /repos/:id/pulls` syncs from GitHub and is slow).
 */
export class Resolver {
  private readonly pullIdCache = new Map<string, string>();

  constructor(private readonly api: DevDigestApi) {}

  /** Accepts an agent uuid or an exact, case-insensitive name (A6/Q6). */
  async agent(idOrName: string): Promise<AgentLite> {
    const agents = await this.api.listAgents();

    const byId = agents.find((a) => a.id === idOrName);
    if (byId) return byId;

    const lower = idOrName.toLowerCase();
    const byName = agents.filter((a) => a.name.toLowerCase() === lower);
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      const ids = byName.map((a) => a.id).join(', ');
      throw new ToolError(
        `Agent name '${idOrName}' matches ${byName.length} agents (ids: ${ids}). Pass the id instead.`,
      );
    }

    throw new ToolError(`Agent '${idOrName}' not found. Call list_agents to get a valid agent id or name.`);
  }

  /** Resolves "owner/name" to the repo the API knows about. */
  async repo(slug: string): Promise<RepoLite> {
    const repos = await this.api.listRepos();
    const lower = slug.toLowerCase();
    const match = repos.find((r) => r.full_name.toLowerCase() === lower);
    if (match) return match;

    const known = repos
      .slice(0, MAX_LISTED)
      .map((r) => r.full_name)
      .join(', ');
    const knownText = known ? ` (known: ${known})` : '';
    throw new ToolError(
      `Repository '${slug}' is not added to DevDigest${knownText}. Add it on the DevDigest home page, then retry.`,
    );
  }

  /** Resolves a PR number to its internal id, memoised for the process
   * lifetime (`repoId#number → prId`) — a cache hit makes zero extra
   * `listPulls` calls. */
  async pull(repoId: string, repoSlug: string, number: number): Promise<string> {
    const cacheKey = `${repoId}#${number}`;
    const cached = this.pullIdCache.get(cacheKey);
    if (cached) return cached;

    const pulls = await this.api.listPulls(repoId);
    const match = pulls.find((p) => p.number === number);
    if (match?.id) {
      this.pullIdCache.set(cacheKey, match.id);
      return match.id;
    }

    const known = pulls
      .slice(0, MAX_LISTED)
      .map((p) => `#${p.number}`)
      .join(', ');
    const knownText = known ? ` (imported: ${known})` : '';
    throw new ToolError(
      `PR #${number} not found in ${repoSlug}${knownText}. Check the number. If the PR is new, make sure a GitHub token is set in DevDigest Settings so PRs sync, then retry.`,
    );
  }
}
