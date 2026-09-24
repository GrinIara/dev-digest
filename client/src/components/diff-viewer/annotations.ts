/* Generic, domain-free line-annotation support for the DiffViewer. No
   imports from app routes and no review-domain vocabulary here — this file
   stays reusable by any feature that wants to inject content under a diff
   line (see `client/AGENTS.md`/frontend-ui-architecture: shared components
   don't import feature code). */
import type { ReactNode } from "react";

/** One piece of content anchored to a diff line, with a colored bar + pill. */
export interface LineAnnotation {
  id: string;
  color: string;
  label: string;
  content: ReactNode;
}

/** Keys are `lineKey` format (`"RIGHT:n"` / `"LEFT:n"`, see `comments.ts`). */
export type LineAnnotationMap = Map<string, LineAnnotation[]>;

/**
 * Split an annotation map into ones that match a rendered line (keyed) and
 * "unanchored" ones whose line isn't rendered in this patch. Modeled on
 * `partitionThreads` (`comments.ts`). Does not mutate its input.
 */
export function partitionAnnotations(
  map: LineAnnotationMap | undefined,
  renderedKeys: Set<string>,
): { matched: LineAnnotationMap; unanchored: LineAnnotation[] } {
  const matched: LineAnnotationMap = new Map();
  const unanchored: LineAnnotation[] = [];
  if (!map) return { matched, unanchored };
  for (const [key, list] of map) {
    if (renderedKeys.has(key)) {
      matched.set(key, [...list]);
    } else {
      unanchored.push(...list);
    }
  }
  return { matched, unanchored };
}
