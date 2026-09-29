import type { FetchLike } from '../../src/api/client.js';

/**
 * A hermetic fake `fetch` for testing `createHttpApi` (and, transitively, the
 * domain helpers and tools built on top of it) without a real DevDigest API.
 * Routes are keyed `"METHOD /path"` (pathname only, no origin/query). A route
 * value is either one fixed response, a sequence of responses consumed in
 * order (the last one repeats once exhausted — useful for run-status
 * transitions like running → running → done), or a function for
 * request-dependent responses.
 */

export interface FakeResponse {
  status: number;
  body: unknown;
  /** Simulate a slow upstream: resolves (or is aborted by the caller's
   * `AbortSignal.timeout`) after this many ms instead of immediately. */
  delayMs?: number;
}

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
}

export type RouteHandler =
  | FakeResponse
  | FakeResponse[]
  | ((call: FakeCall) => FakeResponse | Promise<FakeResponse>);

export interface FakeApi {
  fetch: FetchLike;
  calls: FakeCall[];
}

function toResponse(result: FakeResponse): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });
}

function delayedResponse(result: FakeResponse, signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((resolve, reject) => {
    const ms = result.delayMs ?? 0;
    const timer = setTimeout(() => {
      cleanup();
      resolve(toResponse(result));
    }, ms);
    function onAbort() {
      cleanup();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
  });
}

export function createFakeFetch(routes: Record<string, RouteHandler>): FakeApi {
  const calls: FakeCall[] = [];
  const sequenceIndex = new Map<string, number>();

  const fetchImpl: FetchLike = (async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const url = new URL(rawUrl);
    const method = (init?.method ?? 'GET').toUpperCase();
    let parsedBody: unknown;
    if (typeof init?.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }
    const call: FakeCall = { method, path: url.pathname, body: parsedBody };
    calls.push(call);

    const key = `${method} ${url.pathname}`;
    const handler = routes[key];
    if (handler === undefined) {
      return toResponse({
        status: 404,
        body: { error: { code: 'not_found', message: `no fake route registered for ${key}` } },
      });
    }

    let result: FakeResponse;
    if (Array.isArray(handler)) {
      const idx = sequenceIndex.get(key) ?? 0;
      const item = handler[Math.min(idx, handler.length - 1)];
      if (!item) {
        throw new Error(`fake route ${key} has an empty response sequence`);
      }
      result = item;
      sequenceIndex.set(key, idx + 1);
    } else if (typeof handler === 'function') {
      result = await handler(call);
    } else {
      result = handler;
    }

    if (result.delayMs) {
      return delayedResponse(result, init?.signal);
    }
    return toResponse(result);
  }) as FetchLike;

  return { fetch: fetchImpl, calls };
}

// ---- Canned fixtures, modeled on server/src/db/seed.ts -------------------

export const FIXTURE_REPO = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'acme/payments-api',
};

export const FIXTURE_PR = {
  id: '22222222-2222-4222-8222-222222222222',
  number: 482,
};

export const FIXTURE_AGENTS = [
  {
    id: '33333333-3333-4333-8333-333333333331',
    name: 'General Reviewer',
    description: 'General-purpose code review across correctness, style and maintainability.',
    model: 'gpt-4.1',
    enabled: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333332',
    name: 'Security Reviewer',
    description: 'Focused on security vulnerabilities and unsafe patterns.',
    model: 'gpt-4.1',
    enabled: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Performance Reviewer',
    description: 'Flags performance regressions and inefficient patterns.',
    model: 'gpt-4.1',
    enabled: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333334',
    name: 'Test Quality Reviewer',
    description: 'Assesses whether tests actually cover the change.',
    model: 'gpt-4.1',
    enabled: false,
  },
];

export const FIXTURE_RUN_ID = '44444444-4444-4444-8444-444444444444';

export const FIXTURE_RUN_DONE = {
  run_id: FIXTURE_RUN_ID,
  agent_id: FIXTURE_AGENTS[0]!.id,
  agent_name: FIXTURE_AGENTS[0]!.name,
  status: 'done',
  error: null,
  findings_count: 3,
};

export const FIXTURE_REVIEW = {
  id: '55555555-5555-4555-8555-555555555555',
  run_id: FIXTURE_RUN_ID,
  agent_id: FIXTURE_AGENTS[0]!.id,
  agent_name: FIXTURE_AGENTS[0]!.name,
  kind: 'review' as const,
  verdict: 'request_changes' as const,
  summary: 'Two real issues and a minor style nit.',
  score: 62,
  created_at: '2026-09-20T10:00:00.000Z',
  findings: [
    {
      severity: 'CRITICAL' as const,
      category: 'security' as const,
      title: 'SQL built via string concatenation',
      file: 'src/payments/query.ts',
      start_line: 40,
      end_line: 44,
      rationale: 'User-controlled input is concatenated directly into a SQL string.',
      suggestion: 'Use a parameterized query.',
    },
    {
      severity: 'WARNING' as const,
      category: 'bug' as const,
      title: 'Missing null check before dereference',
      file: 'src/payments/handler.ts',
      start_line: 12,
      end_line: 12,
      rationale: '`invoice` can be null when the lookup misses.',
      suggestion: null,
    },
    {
      severity: 'SUGGESTION' as const,
      category: 'style' as const,
      title: 'Inconsistent naming',
      file: 'src/payments/handler.ts',
      start_line: 20,
      end_line: 20,
      rationale: 'Prefer camelCase for local variables, matching the rest of the file.',
      suggestion: null,
    },
  ],
};

export const FIXTURE_BLAST = {
  pr_id: FIXTURE_PR.id,
  changed_symbols: [{ name: 'rateLimit', file: 'src/lib/rate.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [
        { name: 'publicRouter', file: 'src/api/public/index.ts', line: 23 },
        { name: 'webhookHandler', file: 'src/api/webhooks.ts', line: 10 },
      ],
      endpoints_affected: ['GET /api/public/items'],
      crons_affected: ['job:reset-rate-buckets'],
    },
  ],
  summary: '1 changed symbol(s) reach 2 caller(s); 1 endpoint(s) and 1 cron(s) may be affected.',
  counts: { symbols: 1, callers: 2, endpoints: 1, crons: 1 },
  degraded: false,
  reason: null,
  indexed_sha: 'abc123',
  indexed_branch: 'main',
  callers_truncated: false,
  limits: { max_callers_per_symbol: 20, bfs_depth: 2 },
  facts_by_file: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: ['job:reset-rate-buckets'] },
  },
  files: { changed: 1, indexed: 1 },
};

export const FIXTURE_BLAST_DEGRADED = {
  pr_id: FIXTURE_PR.id,
  changed_symbols: [],
  downstream: [],
  summary: '0 changed symbol(s), no downstream callers found.',
  counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  degraded: true,
  reason: 'no_data',
  indexed_sha: null,
  indexed_branch: null,
  callers_truncated: false,
  limits: { max_callers_per_symbol: 20, bfs_depth: 2 },
  facts_by_file: {},
  files: { changed: 0, indexed: 0 },
};

export const FIXTURE_CONVENTIONS = [
  {
    id: '66666666-6666-4666-8666-666666666661',
    category: 'naming' as const,
    rule: 'Repository methods are named `getX`/`listX`, never `fetchX`.',
    rationale: 'Matches the rest of the codebase.',
    evidence_path: 'src/modules/pulls/repository.ts',
    evidence_line: 12,
    evidence_snippet: 'export async function listPulls(...) { ... }',
    confidence: 0.92,
    status: 'accepted' as const,
  },
  {
    id: '66666666-6666-4666-8666-666666666662',
    category: 'errors' as const,
    rule: 'Domain errors extend `AppError` with a stable `code`.',
    rationale: 'Keeps the API error envelope consistent.',
    evidence_path: 'src/platform/errors.ts',
    evidence_line: 19,
    evidence_snippet: 'export class NotFoundError extends AppError { ... }',
    confidence: 0.88,
    status: 'accepted' as const,
  },
  {
    id: '66666666-6666-4666-8666-666666666663',
    category: 'testing' as const,
    rule: 'Integration tests are named `*.it.test.ts`.',
    rationale: 'Required by the unit/integration test split.',
    evidence_path: 'server/AGENTS.md',
    evidence_line: null,
    evidence_snippet: 'A test importing test/helpers/pg.ts must be named *.it.test.ts.',
    confidence: 0.7,
    status: 'pending' as const,
  },
];
