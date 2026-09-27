import type {
  BlastCaller,
  BlastDegradedReason,
  BlastFileFacts,
  BlastRadiusResponse,
  ChangedSymbol,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, IndexState } from '../repo-intel/types.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';

/**
 * Pure mapping/derivation helpers for the blast module. No I/O — every
 * function here is a straight transform over the facade's `BlastResult` (or
 * over already-derived values), which is what makes them unit-testable
 * without a DB (see `test/blast-map.test.ts`).
 */

/** Always `${word}(s)` regardless of `n` — matches the literal summary strings in the plan (not real singular/plural agreement). */
function plural(n: number, word: string): string {
  return `${n} ${word}(s)`;
}

/**
 * Group flat `BlastResult.callers` by `viaSymbol` into the `DownstreamImpact[]`
 * the transport contract expects (R2).
 *
 * A3 — the grouping key is the symbol *name* (`viaSymbol`), because that's all
 * the facade provides: two changed files that happen to declare the same name
 * merge into one group, and the declaring-file filter below uses the set of
 * ALL files that declare that name (not just the one file that produced the
 * caller). This is accepted (plan A3), not a bug.
 *
 * Self-caller filter is DEFENSIVE: `repo-intel/repository.ts`'s persistent
 * `getResolvedCallers` does not exclude a reference living in the same file
 * that declares the symbol (unlike the ripgrep fallback in
 * `repo-intel/service.ts`, which explicitly skips `r.fromPath === sym.file`),
 * so a changed symbol can otherwise show up as its own caller.
 */
export function groupDownstream(result: BlastResult): DownstreamImpact[] {
  const declFilesByName = new Map<string, Set<string>>();
  for (const cs of result.changedSymbols) {
    const files = declFilesByName.get(cs.name) ?? new Set<string>();
    files.add(cs.file);
    declFilesByName.set(cs.name, files);
  }

  const grouped = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    if (declFilesByName.get(c.viaSymbol)?.has(c.file)) continue;
    const arr = grouped.get(c.viaSymbol);
    if (arr) arr.push(c);
    else grouped.set(c.viaSymbol, [c]);
  }

  const factsByFile = result.factsByFile ?? {};

  const groups = [...grouped.entries()].map(([symbol, callers]) => {
    const sortedCallers = [...callers].sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      if (a.file !== b.file) return a.file < b.file ? -1 : 1;
      return a.line - b.line;
    });
    const maxRank = sortedCallers[0]?.rank ?? 0;

    const callerFiles = [...new Set(callers.map((c) => c.file))];
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of callerFiles) {
      const facts = factsByFile[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const cr of facts.crons) crons.add(cr);
    }

    const impact: DownstreamImpact = {
      symbol,
      callers: sortedCallers.map(
        (c): BlastCaller => ({ name: c.symbol, file: c.file, line: c.line }),
      ),
      endpoints_affected: [...endpoints].sort(),
      crons_affected: [...crons].sort(),
    };
    return { impact, maxRank, count: sortedCallers.length };
  });

  groups.sort((a, b) => {
    if (b.maxRank !== a.maxRank) return b.maxRank - a.maxRank;
    if (b.count !== a.count) return b.count - a.count;
    return a.impact.symbol < b.impact.symbol ? -1 : a.impact.symbol > b.impact.symbol ? 1 : 0;
  });

  return groups.map((g) => g.impact);
}

/** A2 — `counts.symbols` counts every declared symbol, not just those with ≥1 caller. */
export function countBlast(
  downstream: DownstreamImpact[],
  changedSymbols: ChangedSymbol[],
): { symbols: number; callers: number; endpoints: number; crons: number } {
  const callers = downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of downstream) {
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return { symbols: changedSymbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

export function buildSummary(
  counts: { symbols: number; callers: number; endpoints: number; crons: number },
  degraded: boolean,
  reason: BlastDegradedReason | null,
): string {
  let summary: string;
  if (counts.callers === 0) {
    summary = `${plural(counts.symbols, 'changed symbol')}, no downstream callers found.`;
  } else {
    summary =
      `${plural(counts.symbols, 'changed symbol')} reach ${plural(counts.callers, 'caller')}; ` +
      `${plural(counts.endpoints, 'endpoint')} and ${plural(counts.crons, 'cron')} may be affected.`;
  }
  if (degraded) summary += ` Index incomplete (${reason}).`;
  return summary;
}

/**
 * Degraded/reason resolution (R4), evaluated in order — the first matching
 * rule wins:
 *   1. the repo-intel flag is off;
 *   2. no persisted index state, or its status isn't `full`/`partial`;
 *   3. the PR has no synced files (`pr_files` empty — nothing to look up);
 *   4. the facade itself flagged its result degraded;
 *   5. the index is `partial` (usable, but incomplete — R4c);
 *   6. otherwise, healthy.
 */
export function resolveDegraded(input: {
  flagOn: boolean;
  state: IndexState | null;
  filesCount: number;
  result: BlastResult | null;
}): { degraded: boolean; reason: BlastDegradedReason | null } {
  if (!input.flagOn) return { degraded: true, reason: 'flag_off' };

  const { state } = input;
  if (!state || (state.status !== 'full' && state.status !== 'partial')) {
    const reason = state?.degradedReason ?? (state?.status === 'failed' ? 'index_failed' : 'no_data');
    return { degraded: true, reason };
  }

  if (input.filesCount === 0) return { degraded: true, reason: 'no_data' };

  if (input.result?.degraded) {
    return { degraded: true, reason: input.result.reason ?? 'no_data' };
  }

  if (state.status === 'partial') return { degraded: true, reason: 'index_partial' };

  return { degraded: false, reason: null };
}

/** Assemble the full transport response from the facade result + degraded/index metadata. */
export function toBlastRadiusResponse(
  prId: string,
  result: BlastResult | null,
  degradedInfo: { degraded: boolean; reason: BlastDegradedReason | null },
  state: IndexState | null,
): BlastRadiusResponse {
  const changedSymbols: ChangedSymbol[] = result
    ? result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind }))
    : [];
  const downstream = result ? groupDownstream(result) : [];
  const counts = countBlast(downstream, changedSymbols);
  const summary = buildSummary(counts, degradedInfo.degraded, degradedInfo.reason);

  // Restrict facts_by_file to caller files that actually appear in `downstream`
  // (a caller file can be dropped by the self-caller filter above, in which
  // case its facts shouldn't leak into the response either).
  const callerFilesInDownstream = new Set(downstream.flatMap((d) => d.callers.map((c) => c.file)));
  const factsByFile: Record<string, BlastFileFacts> = {};
  if (result?.factsByFile) {
    for (const [file, facts] of Object.entries(result.factsByFile)) {
      if (callerFilesInDownstream.has(file)) factsByFile[file] = facts;
    }
  }

  return {
    changed_symbols: changedSymbols,
    downstream,
    summary,
    pr_id: prId,
    counts,
    degraded: degradedInfo.degraded,
    reason: degradedInfo.reason,
    indexed_sha: state?.lastIndexedSha || null,
    callers_truncated: (result?.callers.length ?? 0) >= MAX_CALLERS_PER_SYMBOL,
    limits: { max_callers_per_symbol: MAX_CALLERS_PER_SYMBOL, bfs_depth: BFS_DEPTH },
    facts_by_file: factsByFile,
  };
}
