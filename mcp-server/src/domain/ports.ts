/**
 * The `DevDigestApi` port. `domain/*` and `tools/*` depend on this file only —
 * never on `api/*` (the HTTP adapter) — so the dependency direction points
 * inward, per the onion layering (§6a of the plan). Everything here is plain
 * TypeScript: no `zod`, no `fetch`, no MCP SDK. `ApiError` is the sole runtime
 * declaration; every other export is a type or interface, erased at build time.
 */

export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export type Verdict = 'request_changes' | 'approve' | 'comment';
export type ReviewKind = 'summary' | 'review';
export type ConventionCategory =
  | 'naming'
  | 'structure'
  | 'errors'
  | 'testing'
  | 'imports'
  | 'typing'
  | 'api'
  | 'general';
export type ConventionStatus = 'pending' | 'accepted' | 'rejected';

export interface AgentLite {
  id: string;
  name: string;
  description: string;
  model: string;
  enabled: boolean;
}

export interface RepoLite {
  id: string;
  full_name: string;
}

export interface PullLite {
  id?: string | null | undefined;
  number: number;
}

export interface ReviewTriggerTarget {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

export interface ReviewTriggerResponse {
  pr_id: string;
  runs: ReviewTriggerTarget[];
}

export interface RunLite {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string | null;
  error: string | null;
  findings_count: number | null;
}

export interface FindingLite {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null | undefined;
}

export interface ReviewLite {
  id: string;
  run_id: string | null;
  agent_id: string | null;
  agent_name?: string | null | undefined;
  kind: ReviewKind;
  verdict: Verdict | null;
  summary: string | null;
  score: number | null;
  created_at: string;
  findings: FindingLite[];
}

export interface ConventionLite {
  id: string;
  category: ConventionCategory;
  rule: string;
  rationale?: string | null | undefined;
  evidence_path: string;
  evidence_line?: number | null | undefined;
  evidence_snippet: string;
  confidence: number;
  status: ConventionStatus;
}

/**
 * The port every `domain/*`/`tools/*` call goes through. `api/client.ts`'s
 * `createHttpApi()` is the only real implementation (the only file that calls
 * `fetch`); tests implement it against a fake `fetch` (see
 * `test/helpers/fake-api.ts`).
 */
export interface DevDigestApi {
  listAgents(): Promise<AgentLite[]>;
  listRepos(): Promise<RepoLite[]>;
  listPulls(repoId: string): Promise<PullLite[]>;
  startReview(prId: string, agentId: string): Promise<ReviewTriggerResponse>;
  listRuns(prId: string): Promise<RunLite[]>;
  listReviews(prId: string): Promise<ReviewLite[]>;
  listConventions(repoId: string): Promise<ConventionLite[]>;
}

/**
 * Normalized transport/HTTP failure, so `domain/*`/`tools/*` never see a raw
 * `fetch` `TypeError`, an `AbortError`, or an un-parsed HTTP body — only this.
 *  - 'unreachable': connection refused / DNS failure (the API isn't running) —
 *    nothing was created server-side, so a caller may safely retry.
 *  - 'timeout': the request exceeded `config.httpTimeoutMs` — the server may
 *    have already processed the request (e.g. started a run) even though the
 *    client never saw the response, so a mutating call must NOT blindly retry.
 *  - 'invalid_response': a 2xx body that failed schema parsing — the request
 *    reached the server and it responded, just not in the expected shape.
 *  - 'invalid_input': a path id failed uuid validation *before* any request
 *    was sent — a client-side precondition failure, not something the API
 *    returned. Distinct from 'invalid_response' so the resulting message
 *    never claims the API "returned" anything.
 *  - 'http': a well-formed non-2xx response from the API itself.
 */
export type ApiErrorKind = 'unreachable' | 'timeout' | 'invalid_response' | 'invalid_input' | 'http';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
