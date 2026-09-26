import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

/**
 * Pure Smart Diff helpers. No Drizzle/Fastify imports — structural input
 * types are declared locally so this file stays reusable outside a request
 * (and importable from `repository.ts`, which is the same module, so that's
 * allowed even though it's otherwise the DB-only layer).
 */

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffInputFinding {
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

/**
 * For each distinct `agentId` (with `null` as its own bucket, A2), returns
 * the element with the greatest `createdAt`. Does not rely on input order.
 */
export function selectLatestReviewPerAgent<T extends { agentId: string | null; createdAt: Date }>(
  reviews: readonly T[],
): T[] {
  const latest = new Map<string | null, T>();
  for (const review of reviews) {
    const current = latest.get(review.agentId);
    if (!current || review.createdAt.getTime() > current.createdAt.getTime()) {
      latest.set(review.agentId, review);
    }
  }
  return [...latest.values()];
}

export function buildSmartDiff(
  files: readonly SmartDiffInputFile[],
  findings: readonly SmartDiffInputFinding[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    if (f.dismissedAt != null) continue;
    let set = linesByFile.get(f.file);
    if (!set) {
      set = new Set<number>();
      linesByFile.set(f.file, set);
    }
    set.add(f.startLine);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffInputFile[]>();
  for (const f of files) {
    const role = classifyFile(f.path);
    let bucket = byRole.get(role);
    if (!bucket) {
      bucket = [];
      byRole.set(role, bucket);
    }
    bucket.push(f);
  }

  const groups = SMART_DIFF_ROLE_ORDER.map((role) => {
    const bucket = byRole.get(role);
    if (!bucket || bucket.length === 0) return null;
    return {
      role,
      files: bucket.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        finding_lines: [...(linesByFile.get(f.path) ?? new Set<number>())].sort((a, b) => a - b),
      })),
    };
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: { too_big: false, total_lines, proposed_splits: [] },
  };
}
