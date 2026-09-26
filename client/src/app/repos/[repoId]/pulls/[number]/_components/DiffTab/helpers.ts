/* DiffTab/helpers.ts — pure helpers for Smart Diff mode: latest-per-agent
   finding selection, the smart/original fallback resolution, and mapping
   findings onto the diff-viewer's generic LineAnnotation extension points.
   No React components, no hooks. */
import type { ReactNode } from "react";
import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  SmartDiff,
  SmartDiffGroup,
  SmartDiffRole,
} from "@devdigest/shared";
import { SEV, type Severity as UiSeverity } from "@devdigest/ui";
import type { LineAnnotationMap } from "@/components/diff-viewer";

/** One Smart Diff role group resolved against the client's `pr.files`
   (A1: re-sorted by each file's index in `pr.files`, so display order is
   deterministic regardless of DB scan order). */
export interface ResolvedGroup {
  role: SmartDiffRole;
  files: PrFile[];
  withFindings: number;
}

/**
 * Latest `kind === "review"` review per `agent_id` (A2: `null` is its own
 * bucket), flattened into its findings. Mirrors the server's
 * `selectLatestReviewPerAgent` (§0.1/A2) so client and server agree on which
 * findings are "active".
 */
export function selectActiveFindings(reviews: ReviewRecord[]): FindingRecord[] {
  const latest = new Map<string | null, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const current = latest.get(r.agent_id);
    if (!current || new Date(r.created_at).getTime() > new Date(current.created_at).getTime()) {
      latest.set(r.agent_id, r);
    }
  }
  return [...latest.values()].flatMap((r) => r.findings);
}

export function findingsByFile(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const map = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = map.get(f.file) ?? [];
    list.push(f);
    map.set(f.file, list);
  }
  return map;
}

/** Maps findings on one file onto the diff-viewer's generic annotation
   contract — `RIGHT:${start_line}` anchors only (A5: findings cite new-file
   lines; anything unanchored is handled by `FileCard`'s footer). */
export function findingAnnotations(
  findings: FindingRecord[],
  renderCard: (f: FindingRecord) => ReactNode,
  labelFor: (f: FindingRecord) => string,
): LineAnnotationMap {
  const map: LineAnnotationMap = new Map();
  for (const f of findings) {
    const key = `RIGHT:${f.start_line}`;
    const list = map.get(key) ?? [];
    list.push({
      id: f.id,
      color: f.dismissed_at ? "var(--text-muted)" : SEV[f.severity as UiSeverity].c,
      label: labelFor(f),
      content: renderCard(f),
    });
    map.set(key, list);
  }
  return map;
}

/** Count of files in a group with ≥1 finding — file-based, not finding-based
   (the `● N` counter counts files, per R6/R7). */
export function filesWithFindings(group: SmartDiffGroup): number {
  return group.files.filter((f) => f.finding_lines.length > 0).length;
}

/**
 * Resolves the Smart Diff response against `pr.files`. Returns `null` when
 * `smart` is undefined or the smart-diff path set doesn't equal the
 * `pr.files` path set (R6's fallback to original order — e.g. right after a
 * PR refresh changes `pr.files` before the smart-diff cache catches up).
 */
export function resolveSmartGroups(
  smart: SmartDiff | undefined,
  files: PrFile[],
): ResolvedGroup[] | null {
  if (!smart) return null;

  const smartPaths = new Set(smart.groups.flatMap((g) => g.files.map((f) => f.path)));
  const filePaths = new Set(files.map((f) => f.path));
  if (smartPaths.size !== filePaths.size) return null;
  for (const p of smartPaths) if (!filePaths.has(p)) return null;

  const indexByPath = new Map(files.map((f, i) => [f.path, i]));
  const fileByPath = new Map(files.map((f) => [f.path, f]));

  return smart.groups.map((g) => {
    const sortedFiles = [...g.files]
      .sort((a, b) => (indexByPath.get(a.path) ?? 0) - (indexByPath.get(b.path) ?? 0))
      .map((f) => fileByPath.get(f.path))
      .filter((f): f is PrFile => f != null);
    return { role: g.role, files: sortedFiles, withFindings: filesWithFindings(g) };
  });
}

/** File paths that should show the "has findings" dot (A6): from the
   server's `finding_lines` when Smart Diff is available, else from
   non-dismissed active findings (the original-order fallback). */
export function markedPathsFrom(
  smart: SmartDiff | undefined,
  activeFindings: FindingRecord[],
): Set<string> {
  if (smart) {
    const paths = new Set<string>();
    for (const g of smart.groups) for (const f of g.files) if (f.finding_lines.length > 0) paths.add(f.path);
    return paths;
  }
  const paths = new Set<string>();
  for (const f of activeFindings) if (!f.dismissed_at) paths.add(f.file);
  return paths;
}

export function diffTotals(files: PrFile[]): { additions: number; deletions: number } {
  return files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 },
  );
}
