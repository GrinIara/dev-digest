import { z } from 'zod';

/**
 * Config for the DevDigest MCP server, read once at startup from the process
 * environment. Loopback-only and clamped timeouts are enforced here so the
 * security and timeout constraints (R11/R12) are structural, not advisory:
 * `waitMs`'s upper bound (280_000) stays below the `.mcp.json` `"timeout"`
 * (300_000), so a timed-out wait always gets a chance to reply before Claude
 * Code kills the call.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackApiUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // A username/password embedded in the URL (`http://user:pass@localhost`) or
  // a non-empty query/hash are never needed for a loopback API base URL and
  // are common smuggling vectors for credentials or a redirect target — both
  // rejected outright rather than silently stripped (security review M2).
  if (url.username !== '' || url.password !== '') return false;
  if (url.search !== '' || url.hash !== '') return false;
  return LOOPBACK_HOSTS.has(url.hostname);
}

export const McpConfigSchema = z.object({
  apiUrl: z
    .string()
    .default('http://localhost:3001')
    .refine(isLoopbackApiUrl, {
      message:
        'must be a plain http:// or https:// URL with a loopback hostname (localhost, 127.0.0.1, ::1, [::1]) and no userinfo, query or fragment',
    }),
  apiToken: z.string().min(1).optional(),
  waitMs: z.coerce.number().int().min(5_000).max(280_000).default(120_000),
  pollMs: z.coerce.number().int().min(250).max(30_000).default(2_000),
  httpTimeoutMs: z.coerce.number().int().min(1_000).max(60_000).default(15_000),
});
export type McpConfig = z.infer<typeof McpConfigSchema>;

/** Maps each schema field back to the env var name, for error messages only. */
const ENV_VAR_NAMES: Record<string, string> = {
  apiUrl: 'DEVDIGEST_API_URL',
  apiToken: 'DEVDIGEST_API_TOKEN',
  waitMs: 'DEVDIGEST_RUN_WAIT_MS',
  pollMs: 'DEVDIGEST_RUN_POLL_MS',
  httpTimeoutMs: 'DEVDIGEST_HTTP_TIMEOUT_MS',
};

/**
 * Loads and validates config from the environment. Throws a plain Error
 * naming the offending env var(s) — never the value, so a malformed token
 * never leaks into a thrown message or a log line.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const raw = {
    apiUrl: env.DEVDIGEST_API_URL,
    apiToken: env.DEVDIGEST_API_TOKEN,
    waitMs: env.DEVDIGEST_RUN_WAIT_MS,
    pollMs: env.DEVDIGEST_RUN_POLL_MS,
    httpTimeoutMs: env.DEVDIGEST_HTTP_TIMEOUT_MS,
  };
  const result = McpConfigSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const field = issue.path[0];
      const envName = typeof field === 'string' ? (ENV_VAR_NAMES[field] ?? field) : 'config';
      return `${envName}: ${issue.message}`;
    });
    throw new Error(`Invalid DevDigest MCP server configuration — ${messages.join('; ')}`);
  }
  return result.data;
}
