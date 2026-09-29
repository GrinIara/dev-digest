import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { redact, registerSecret } from '../src/log.js';

describe('loadConfig', () => {
  it('applies documented defaults when no env vars are set', () => {
    const config = loadConfig({});
    expect(config).toEqual({
      apiUrl: 'http://localhost:3001',
      waitMs: 120_000,
      pollMs: 2_000,
      httpTimeoutMs: 15_000,
    });
  });

  it('accepts loopback hosts other than the default', () => {
    const config = loadConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:4000' });
    expect(config.apiUrl).toBe('http://127.0.0.1:4000');
  });

  it('rejects a non-loopback DEVDIGEST_API_URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'http://example.com' })).toThrow(
      /DEVDIGEST_API_URL/,
    );
  });

  it('rejects a loopback URL carrying userinfo (username/password) — security review M2', () => {
    expect(() =>
      loadConfig({ DEVDIGEST_API_URL: 'http://user:pass@localhost:3001' }),
    ).toThrow(/DEVDIGEST_API_URL/);
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'http://user@localhost:3001' })).toThrow(
      /DEVDIGEST_API_URL/,
    );
  });

  it('rejects a loopback URL carrying a non-empty query string — security review M2', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'http://localhost:3001?x=1' })).toThrow(
      /DEVDIGEST_API_URL/,
    );
  });

  it('rejects a loopback URL carrying a non-empty fragment — security review M2', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'http://localhost:3001#frag' })).toThrow(
      /DEVDIGEST_API_URL/,
    );
  });

  it('rejects a wait above the 280000ms ceiling', () => {
    expect(() => loadConfig({ DEVDIGEST_RUN_WAIT_MS: '300000' })).toThrow(
      /DEVDIGEST_RUN_WAIT_MS/,
    );
  });

  it('rejects a wait below the 5000ms floor', () => {
    expect(() => loadConfig({ DEVDIGEST_RUN_WAIT_MS: '100' })).toThrow(/DEVDIGEST_RUN_WAIT_MS/);
  });

  it('coerces numeric env vars and accepts a configured token', () => {
    const config = loadConfig({
      DEVDIGEST_API_TOKEN: 'my-secret-token',
      DEVDIGEST_RUN_POLL_MS: '3000',
      DEVDIGEST_HTTP_TIMEOUT_MS: '5000',
    });
    expect(config.apiToken).toBe('my-secret-token');
    expect(config.pollMs).toBe(3000);
    expect(config.httpTimeoutMs).toBe(5000);
  });

  it('never echoes the token value in a validation error message', () => {
    // An invalid neighbor var still triggers a thrown error; the (valid) token
    // must not leak into that message.
    let message = '';
    try {
      loadConfig({
        DEVDIGEST_API_TOKEN: 'super-secret-value',
        DEVDIGEST_RUN_WAIT_MS: 'not-a-number',
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('super-secret-value');
  });
});

describe('redact', () => {
  it('masks a Bearer token', () => {
    expect(redact('Authorization: Bearer abc123.def456')).not.toContain('abc123.def456');
  });

  it('masks an sk- style key', () => {
    expect(redact('key=sk-abcdEFGH1234')).not.toContain('sk-abcdEFGH1234');
  });

  it('masks a ghp_ personal access token', () => {
    expect(redact('token ghp_1234567890abcdef')).not.toContain('ghp_1234567890abcdef');
  });

  it('masks a github_pat_ token', () => {
    expect(redact('token github_pat_11ABCDEFG_xyz')).not.toContain('github_pat_11ABCDEFG_xyz');
  });

  it('masks the configured token value even without a known secret shape', () => {
    registerSecret('plain-configured-token');
    expect(redact('error contains plain-configured-token in body')).not.toContain(
      'plain-configured-token',
    );
  });
});
