import { describe, it, expect } from 'vitest';
import { ContextDocPath, SetContextAttachmentsBody, RunTrace } from '@devdigest/shared';

describe('SPEC-2026-09-29-project-context contracts', () => {
  it('ContextDocPath rejects unsafe paths', () => {
    for (const p of ['/etc/x.md', '../secrets.md', 'docs/../x.md', 'a\\b.md', 'C:/x.md']) {
      expect(ContextDocPath.safeParse(p).success, p).toBe(false);
    }
  });

  it('ContextDocPath accepts dot-dir and README paths', () => {
    expect(ContextDocPath.safeParse('.devdigest/specs/a.md').success).toBe(true);
    expect(ContextDocPath.safeParse('README.md').success).toBe(true);
  });

  it('SetContextAttachmentsBody rejects duplicates', () => {
    expect(SetContextAttachmentsBody.safeParse({ paths: ['a.md', 'a.md'] }).success).toBe(false);
    expect(SetContextAttachmentsBody.safeParse({ paths: ['a.md', 'b.md'] }).success).toBe(true);
  });

  it('RunTrace parses a legacy trace without specs_missing/specs_tokens', () => {
    const legacy = {
      config: { agent: 'a', model: 'm' },
      stats: {
        duration_ms: 1,
        tokens_in: 1,
        tokens_out: 1,
        cost_usd: null,
        findings: 0,
        grounding: 'x',
      },
      prompt_assembly: { system: 's', user: 'u', specs: null },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [],
    };
    const r = RunTrace.safeParse(legacy);
    expect(r.success, JSON.stringify(r.success ? '' : r.error.issues)).toBe(true);
  });
});
