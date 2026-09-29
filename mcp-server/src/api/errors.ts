import { ApiError } from '../domain/ports.js';
import { redact } from '../log.js';
import { ApiErrorEnvelope } from './schemas.js';

/** Server-derived error text is redacted then capped, so a leaked secret or an
 * oversized stack-trace-shaped message never reaches a tool result (R12). */
const MAX_MESSAGE_LEN = 300;

function sanitize(message: string): string {
  const clean = redact(message);
  return clean.length > MAX_MESSAGE_LEN ? `${clean.slice(0, MAX_MESSAGE_LEN)}…` : clean;
}

/** Builds an `ApiError('http', ...)` from a non-2xx response. Parses the
 * standard `ApiErrorBody` envelope (`{ error: { code, message, details } }`)
 * when present; falls back to a generic status-based message otherwise (an
 * empty body, an upstream proxy error page, etc). A 3xx is special-cased with
 * a message naming the likely cause (`DEVDIGEST_API_URL` pointing at a proxy
 * or a rewritten URL) — requests are sent with `redirect: 'error'` (R12), so a
 * well-formed 3xx response reaching here means some fetch implementation
 * resolved the redirect response instead of rejecting it. */
export async function httpErrorFromResponse(response: Response): Promise<ApiError> {
  if (response.status >= 300 && response.status < 400) {
    return new ApiError(
      'http',
      sanitize(
        `DevDigest API responded with an HTTP redirect (${response.status}). Check DEVDIGEST_API_URL points directly at the API, not through a proxy or rewrite, then retry.`,
      ),
      response.status,
    );
  }
  let code: string | undefined;
  let message = `DevDigest API responded with HTTP ${response.status}`;
  try {
    const body: unknown = await response.json();
    const parsed = ApiErrorEnvelope.safeParse(body);
    if (parsed.success) {
      code = parsed.data.error.code;
      message = parsed.data.error.message;
    }
  } catch {
    // Non-JSON or empty body — keep the generic status-based message.
  }
  return new ApiError('http', sanitize(message), response.status, code);
}

/** Connection refused, DNS failure, or any other network-layer `fetch`
 * rejection that isn't a timeout. */
export function unreachableError(apiUrl: string, cause: unknown): ApiError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ApiError('unreachable', sanitize(`DevDigest API is not reachable at ${apiUrl} (${detail})`));
}

/** The request was aborted by `AbortSignal.timeout(config.httpTimeoutMs)`. */
export function timeoutError(apiUrl: string): ApiError {
  return new ApiError('timeout', `DevDigest API request to ${apiUrl} timed out`);
}

/** `fetch` rejected because a redirect response was received while
 * `redirect: 'error'` was set (Node/undici's own wording for this is a
 * `TypeError` whose message mentions "redirect"). Distinct from
 * `unreachableError` — the server responded, it just isn't the API directly
 * reachable at `DEVDIGEST_API_URL`. */
export function redirectRejectedError(apiUrl: string, cause: unknown): ApiError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ApiError(
    'invalid_response',
    sanitize(
      `DevDigest API request to ${apiUrl} was redirected (${detail}). Check DEVDIGEST_API_URL points directly at the API, not through a proxy or rewrite, then retry.`,
    ),
  );
}

/** A 2xx body that failed schema parsing. */
export function invalidResponseError(detail: string): ApiError {
  return new ApiError(
    'invalid_response',
    sanitize(`DevDigest API returned an unexpected response: ${detail}`),
  );
}

/** A path id failed uuid validation *before* any request was sent — a
 * client-side precondition failure, never attributed to the API "returning"
 * anything (kind `invalid_input`, not `invalid_response`). Forward-leading:
 * this always indicates a bug in the MCP server or its caller, since ids
 * reaching here were meant to already be resolved uuids. */
export function invalidIdError(label: string, value: string): ApiError {
  return new ApiError(
    'invalid_input',
    sanitize(
      `Invalid ${label}: "${value}" is not a uuid, so no request was sent to the API. This indicates a bug in the MCP server (an id was passed through unresolved) rather than an API problem — retry once; if it persists, report it with the MCP server log (stderr).`,
    ),
  );
}
