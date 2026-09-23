/**
 * `platform/redact.ts` — strips embedded URL credentials (e.g. a GitHub PAT
 * baked into a clone URL via `repos/helpers.ts`'s `withGitHubToken()`) out of
 * error messages before `JobRunner` persists them to the `jobs` table.
 */
import { describe, it, expect } from 'vitest';
import { redactUrlCredentials } from '../src/platform/redact.js';

describe('redactUrlCredentials', () => {
  it('redacts a GitHub PAT embedded as URL userinfo', () => {
    const msg =
      "fatal: could not read Username for 'https://x-access-token:ghp_abc123XYZ@github.com/acme/payments-api.git': terminal prompts disabled";
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain('ghp_abc123XYZ');
    expect(out).toContain('https://[redacted]@github.com/acme/payments-api.git');
  });

  it('redacts multiple credentialed URLs in the same message', () => {
    const msg = 'tried https://user:pw1@a.example/x then https://user:pw2@b.example/y';
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain('pw1');
    expect(out).not.toContain('pw2');
  });

  it('leaves messages without embedded credentials untouched', () => {
    const msg = 'network timeout cloning https://github.com/acme/payments-api.git';
    expect(redactUrlCredentials(msg)).toBe(msg);
  });

  it('is a no-op on plain (non-URL) error text', () => {
    const msg = 'ENOTFOUND github.com';
    expect(redactUrlCredentials(msg)).toBe(msg);
  });
});
