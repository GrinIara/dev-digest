/**
 * scope.ts — the post-grounding out-of-scope filter (T4, §0.4). Pins the
 * "serious findings are never dropped" guarantee and the scope-stripping
 * contract.
 */
import { describe, it, expect } from 'vitest';
import type { ScopedFinding } from '@devdigest/shared';
import { applyScopeFilter, isSeriousFinding } from '../src/scope.js';

function finding(overrides: Partial<ScopedFinding> = {}): ScopedFinding {
  return {
    id: 'f1',
    severity: 'SUGGESTION',
    category: 'style',
    title: 'a finding',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.9,
    ...overrides,
  };
}

describe('applyScopeFilter', () => {
  it('drops an out-of-scope SUGGESTION', () => {
    const f = finding({ scope: 'out', severity: 'SUGGESTION' });
    const result = applyScopeFilter([f], { enabled: true });

    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.reason).toBe('out-of-scope (non-serious)');
    expect(result.summary).toEqual({
      applied: true,
      kept_out_of_scope: 0,
      dropped_out_of_scope: 1,
    });
  });

  it('keeps an out-of-scope CRITICAL finding with its true severity', () => {
    const f = finding({ scope: 'out', severity: 'CRITICAL', category: 'bug' });
    const result = applyScopeFilter([f], { enabled: true });

    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.severity).toBe('CRITICAL');
    expect(result.dropped).toHaveLength(0);
    expect(result.summary.kept_out_of_scope).toBe(1);
  });

  it('keeps an out-of-scope WARNING in the security category', () => {
    const f = finding({ scope: 'out', severity: 'WARNING', category: 'security' });
    const result = applyScopeFilter([f], { enabled: true });

    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.severity).toBe('WARNING');
    expect(result.dropped).toHaveLength(0);
  });

  it('drops an out-of-scope WARNING in the style category', () => {
    const f = finding({ scope: 'out', severity: 'WARNING', category: 'style' });
    const result = applyScopeFilter([f], { enabled: true });

    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });

  it('keeps a finding with a null or missing scope (fail-open)', () => {
    const nullScope = finding({ scope: null, severity: 'SUGGESTION' });
    const missingScope = finding({ id: 'f2', severity: 'SUGGESTION' });
    delete (missingScope as { scope?: unknown }).scope;

    const result = applyScopeFilter([nullScope, missingScope], { enabled: true });

    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);
  });

  it('drops nothing when enabled is false, even for a non-serious out-of-scope finding', () => {
    const f = finding({ scope: 'out', severity: 'SUGGESTION' });
    const result = applyScopeFilter([f], { enabled: false });

    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
    expect(result.summary).toEqual({
      applied: false,
      kept_out_of_scope: 1,
      dropped_out_of_scope: 0,
    });
  });

  it('strips the scope key from every kept finding', () => {
    const inScope = finding({ scope: 'in' });
    const outScopeSerious = finding({ id: 'f2', scope: 'out', severity: 'CRITICAL' });
    const result = applyScopeFilter([inScope, outScopeSerious], { enabled: true });

    for (const kept of result.kept) {
      expect(Object.prototype.hasOwnProperty.call(kept, 'scope')).toBe(false);
    }
  });
});

describe('isSeriousFinding', () => {
  it('treats secret_leak and lethal_trifecta kinds as serious regardless of severity', () => {
    expect(isSeriousFinding(finding({ severity: 'SUGGESTION', kind: 'secret_leak' }))).toBe(true);
    expect(isSeriousFinding(finding({ severity: 'SUGGESTION', kind: 'lethal_trifecta' }))).toBe(true);
  });

  it('a plain SUGGESTION/style finding is not serious', () => {
    expect(isSeriousFinding(finding({ severity: 'SUGGESTION', category: 'style' }))).toBe(false);
  });
});
