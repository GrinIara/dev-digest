import { z } from 'zod';
import type { DevDigestApi } from '../domain/ports.js';
import type { McpConfig } from '../config.js';
import {
  AgentLite,
  RepoLite,
  PullLite,
  ReviewTriggerResponse,
  RunLite,
  ReviewLite,
  ConventionLite,
} from './schemas.js';
import {
  httpErrorFromResponse,
  unreachableError,
  timeoutError,
  invalidResponseError,
  invalidIdError,
  redirectRejectedError,
} from './errors.js';

/** Matches this repo's uuid PKs (`server/src/modules/_shared/schemas.ts`'s
 * `IdParams`). Checked before any id is interpolated into a URL path, so a
 * malformed id never reaches `fetch` (R12). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw invalidIdError(label, value);
  }
}

export type FetchLike = typeof fetch;

/**
 * The only file in this package that calls `fetch`. Implements the
 * `DevDigestApi` port declared in `domain/ports.ts`. Every call: adds the
 * `Bearer` header only when a token is configured, times out via
 * `AbortSignal.timeout(config.httpTimeoutMs)` (real cancellation, not a
 * `Promise.race` helper — see reviewer-core Insights 2026-09-24), refuses to
 * follow a redirect (`redirect: 'error'`, R12 — a redirect could otherwise
 * carry the request, and any `Authorization` header, off loopback), and
 * parses the body with the local schemas from `./schemas.ts`.
 *
 * Side-effect free (arch F1): registering the configured token with `log.ts`'s
 * `redact()` is the caller's job (`src/index.ts`, right after `loadConfig()`),
 * not this factory's — constructing an API client must not have observable
 * side effects on shared module state.
 */
export function createHttpApi(config: McpConfig, fetchImpl: FetchLike = fetch): DevDigestApi {
  async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const url = `${config.apiUrl}${path}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (config.apiToken) headers.authorization = `Bearer ${config.apiToken}`;
    if (init?.body !== undefined) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(config.httpTimeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : undefined;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw timeoutError(url);
      }
      if (err instanceof TypeError && /redirect/i.test(err.message)) {
        throw redirectRejectedError(url, err);
      }
      throw unreachableError(url, err);
    }

    if (!response.ok) {
      throw await httpErrorFromResponse(response);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      throw invalidResponseError(`could not parse JSON body (${(err as Error).message})`);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw invalidResponseError(`response for ${path} did not match the expected shape`);
    }
    return parsed.data;
  }

  return {
    async listAgents() {
      return request('/agents', z.array(AgentLite));
    },

    async listRepos() {
      return request('/repos', z.array(RepoLite));
    },

    async listPulls(repoId: string) {
      assertUuid(repoId, 'repoId');
      return request(`/repos/${repoId}/pulls`, z.array(PullLite));
    },

    async startReview(prId: string, agentId: string) {
      assertUuid(prId, 'prId');
      assertUuid(agentId, 'agentId');
      return request(`/pulls/${prId}/review`, ReviewTriggerResponse, {
        method: 'POST',
        body: JSON.stringify({ agentId }),
      });
    },

    async listRuns(prId: string) {
      assertUuid(prId, 'prId');
      return request(`/pulls/${prId}/runs`, z.array(RunLite));
    },

    async listReviews(prId: string) {
      assertUuid(prId, 'prId');
      return request(`/pulls/${prId}/reviews`, z.array(ReviewLite));
    },

    async listConventions(repoId: string) {
      assertUuid(repoId, 'repoId');
      return request(`/repos/${repoId}/conventions`, z.array(ConventionLite));
    },
  };
}
