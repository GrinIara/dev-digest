import type { Finding, UnifiedDiff } from '@devdigest/shared';

/**
 * Citation grounding — the mandatory mechanical gate for diff-findings.
 *
 * A diff-finding is kept ONLY if its [start_line, end_line] range intersects a
 * real hunk in the unified diff for the same file. Findings that fail are
 * dropped (the model "hallucinated" a location).
 *
 * EXCEPTION: findings from full-file scanners (hooks / blast / onboarding) are
 * not tied to a diff hunk — they ground against the file existing in the diff
 * (or are exempted entirely). We treat `kind` in {phantom, hook} as full-file:
 * they only require the file to be present.
 *
 * `secret_leak` / `lethal_trifecta` are the most dangerous finding kinds and
 * are NOT exempted from citation grounding: they must additionally carry a
 * non-empty `evidence` array, and EVERY evidence entry's `[file, line]` must
 * be a real diff line (same line-index mechanism as the regular `finding`
 * path), or the finding is dropped. Without this, a model could self-declare
 * `kind: 'secret_leak'` to bypass all verification — the exact gate this
 * citation mechanism exists to enforce.
 */

const FULL_FILE_KINDS = new Set(['phantom', 'hook']);
/** Kinds whose `evidence[]` must be verified against the diff's line index. */
const EVIDENCE_VERIFIED_KINDS = new Set(['secret_leak', 'lethal_trifecta']);

export interface GroundingResult<F extends Finding = Finding> {
  kept: F[];
  dropped: { finding: F; reason: string }[];
}

/** Build a quick lookup of file → set of new-side line numbers covered by hunks. */
export function buildLineIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  const idx = new Map<string, Set<number>>();
  for (const f of diff.files) {
    const set = new Set<number>();
    for (const h of f.hunks) {
      if (h.newLineNumbers && h.newLineNumbers.length > 0) {
        for (const n of h.newLineNumbers) set.add(n);
      } else {
        // fall back to the hunk's declared new range
        for (let n = h.newStart; n < h.newStart + Math.max(h.newLines, 1); n++) set.add(n);
      }
    }
    idx.set(f.path, set);
  }
  return idx;
}

function rangeIntersects(lines: Set<number>, start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let n = lo; n <= hi; n++) if (lines.has(n)) return true;
  return false;
}

/**
 * Apply the grounding gate to a set of findings against a unified diff.
 * Returns the kept findings and the dropped ones with reasons (for the trace).
 */
export function groundFindings<F extends Finding = Finding>(
  findings: F[],
  diff: UnifiedDiff,
): GroundingResult<F> {
  const lineIndex = buildLineIndex(diff);
  const filesInDiff = new Set(diff.files.map((f) => f.path));
  const kept: F[] = [];
  const dropped: { finding: F; reason: string }[] = [];

  for (const finding of findings) {
    const isFullFile = finding.kind ? FULL_FILE_KINDS.has(finding.kind) : false;
    const requiresEvidence = finding.kind ? EVIDENCE_VERIFIED_KINDS.has(finding.kind) : false;

    if (!filesInDiff.has(finding.file)) {
      dropped.push({ finding, reason: `file '${finding.file}' not present in diff` });
      continue;
    }

    if (requiresEvidence) {
      const evidence = finding.evidence ?? [];
      if (evidence.length === 0) {
        dropped.push({
          finding,
          reason: `kind '${finding.kind}' requires non-empty evidence citing real diff lines; none provided`,
        });
        continue;
      }
      // Every cited evidence point must be a real diff line — a self-declared
      // kind is not itself proof; each component's citation is checked the
      // same way a regular finding's [start_line, end_line] range is.
      const unverified = evidence.filter((e) => {
        if (!filesInDiff.has(e.file)) return true;
        const evidenceLines = lineIndex.get(e.file) ?? new Set<number>();
        return !evidenceLines.has(e.line);
      });
      if (unverified.length > 0) {
        const cites = unverified.map((e) => `${e.file}:${e.line}`).join(', ');
        dropped.push({
          finding,
          reason: `evidence citing ${cites} does not intersect any diff hunk`,
        });
        continue;
      }
      kept.push(finding);
      continue;
    }

    if (isFullFile) {
      // full-file scanners only need the file to be in the diff
      kept.push(finding);
      continue;
    }

    const lines = lineIndex.get(finding.file) ?? new Set<number>();
    if (rangeIntersects(lines, finding.start_line, finding.end_line)) {
      kept.push(finding);
    } else {
      dropped.push({
        finding,
        reason: `lines ${finding.start_line}-${finding.end_line} do not intersect any diff hunk in '${finding.file}'`,
      });
    }
  }

  return { kept, dropped };
}

/** Human-readable summary, e.g. "3/3 passed" used in run-trace stats. */
export function groundingSummary(result: GroundingResult): string {
  const total = result.kept.length + result.dropped.length;
  return `${result.kept.length}/${total} passed`;
}
