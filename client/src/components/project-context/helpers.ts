import { NOT_CLONED_CODE } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import type { ContextAttachedRow, ContextDocType } from "@/lib/types";

/** Case-insensitive substring filter over the row path. Empty query keeps everything. */
export function filterByPath<T extends { path: string }>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(needle));
}

/** Returns a copy of `paths` with the item at `from` moved to `to`; out-of-range is a no-op. */
export function moveItem(paths: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= paths.length || to >= paths.length) return paths;
  const next = paths.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Attach (`on`, appended last) or detach `path`; attaching an already attached path is a no-op. */
export function togglePath(paths: string[], path: string, on: boolean): string[] {
  if (on) return paths.includes(path) ? paths : [...paths, path];
  return paths.filter((p) => p !== path);
}

export const GROUP_ORDER: readonly ContextDocType[] = ["specs", "docs", "insights"];

export interface SerializationGroup {
  type: ContextDocType;
  paths: string[];
}

/** Groups attached paths by doc type in specs|docs|insights order, keeping attached order; empty groups are omitted. */
export function groupForSerialization(rows: ContextAttachedRow[]): SerializationGroup[] {
  return GROUP_ORDER.map((type) => ({
    type,
    paths: rows.filter((r) => r.type === type).map((r) => r.path),
  })).filter((g) => g.paths.length > 0);
}

/** Sum of known token counts (missing rows count as 0). */
export function sumTokens(rows: { tokens: number | null }[]): number {
  return rows.reduce((acc, r) => acc + (r.tokens ?? 0), 0);
}

/** Splits a repo-relative path into its folder ("" for the root) and file name. */
export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i), name: path.slice(i + 1) };
}

/** True for the API's 409 `not_cloned` error (repo not yet cloned). */
export function isNotClonedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === NOT_CLONED_CODE;
}
