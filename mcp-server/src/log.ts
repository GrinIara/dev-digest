/**
 * stderr-only structured logger. The MCP transport is stdio, so stdout carries
 * JSON-RPC exclusively (R1) — every log line goes to stderr as one JSON
 * object per line, never through console.log.
 */

export type LogFields = Record<string, unknown>;

const REDACTED = '[REDACTED]';

/** Secret-shaped substrings redacted unconditionally, independent of config. */
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+\S+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /ghp_[A-Za-z0-9]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
];

/** The configured `DEVDIGEST_API_TOKEN` value, registered once at startup so
 * `redact()` can mask it even where it doesn't match a known secret shape. */
let configuredToken: string | undefined;

export function registerSecret(secret: string | undefined): void {
  if (secret) configuredToken = secret;
}

/** Masks known secret shapes and the configured token from a string. Used on
 * every log line and on any server-derived error message before it reaches
 * a tool result (R12). */
export function redact(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  if (configuredToken) {
    result = result.split(configuredToken).join(REDACTED);
  }
  return result;
}

function redactFields(fields: LogFields): LogFields {
  const result: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = typeof value === 'string' ? redact(value) : value;
  }
  return result;
}

function write(level: 'info' | 'warn' | 'error', msg: string, fields?: LogFields): void {
  const line: LogFields = {
    level,
    time: new Date().toISOString(),
    msg: redact(msg),
  };
  if (fields) line.fields = redactFields(fields);
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  info(msg: string, fields?: LogFields): void {
    write('info', msg, fields);
  },
  warn(msg: string, fields?: LogFields): void {
    write('warn', msg, fields);
  },
  error(msg: string, fields?: LogFields): void {
    write('error', msg, fields);
  },
};
