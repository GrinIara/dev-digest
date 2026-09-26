import type { Finding, ScopedFinding, ScopeFilterSummary } from '@devdigest/shared';

/**
 * Out-of-scope filter — a pure, mechanical post-processing step applied
 * AFTER citation grounding (T4, intent layer §0.4). Analogous to
 * `grounding.ts`'s citation gate: data-in/data-out, no I/O, applies
 * identically wherever `reviewPullRequest` runs (studio + CI runner).
 *
 * The scope filter never downgrades a finding's severity and never drops a
 * SERIOUS finding, even when it's labelled out-of-scope. This guarantees
 * "at least one signal": a malicious or mistaken "everything is out of
 * scope" claim can suppress at most non-serious findings, and only when the
 * intent's confidence is high (the caller controls `opts.enabled`).
 */

/**
 * A finding is "serious" — and therefore never dropped by the scope filter,
 * regardless of its declared `scope` — when it is a CRITICAL finding, a
 * WARNING in the security/bug categories, or a self-declared secret-leak /
 * lethal-trifecta kind (the most dangerous finding kinds; see
 * `grounding.ts`'s evidence-verification note on those kinds).
 */
export function isSeriousFinding(f: Finding): boolean {
  if (f.severity === 'CRITICAL') return true;
  if (f.severity === 'WARNING' && (f.category === 'security' || f.category === 'bug')) {
    return true;
  }
  if (f.kind === 'secret_leak' || f.kind === 'lethal_trifecta') return true;
  return false;
}

function stripScope(f: ScopedFinding): Finding {
  const rest = { ...f };
  delete (rest as { scope?: unknown }).scope;
  return rest;
}

export interface ScopeFilterResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
  summary: ScopeFilterSummary;
}

/**
 * Drop non-serious out-of-scope findings when `opts.enabled` (the caller
 * passes `intent.confidence === 'high'` — a low-confidence intent must not
 * suppress anything). `scope` is always stripped from the returned findings
 * so persisted `Finding` rows and the DB stay unchanged (R4).
 */
export function applyScopeFilter(
  findings: ScopedFinding[],
  opts: { enabled: boolean },
): ScopeFilterResult {
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];
  let keptOutOfScope = 0;
  let droppedOutOfScope = 0;

  for (const f of findings) {
    const isOutOfScope = f.scope === 'out';
    const stripped = stripScope(f);

    if (opts.enabled && isOutOfScope && !isSeriousFinding(f)) {
      dropped.push({ finding: stripped, reason: 'out-of-scope (non-serious)' });
      droppedOutOfScope += 1;
      continue;
    }

    kept.push(stripped);
    if (isOutOfScope) keptOutOfScope += 1;
  }

  return {
    kept,
    dropped,
    summary: {
      applied: opts.enabled,
      kept_out_of_scope: keptOutOfScope,
      dropped_out_of_scope: droppedOutOfScope,
    },
  };
}
