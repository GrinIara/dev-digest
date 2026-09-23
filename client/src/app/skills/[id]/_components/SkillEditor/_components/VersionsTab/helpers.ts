import { diffLines } from "diff";

export type DiffLineType = "add" | "remove" | "same";
export interface DiffLine {
  type: DiffLineType;
  value: string;
}

/** Line-level diff between two skill-version bodies for the Versions tab's
 *  own small diff modal. NOT the PR DiffViewer (components/diff-viewer) —
 *  that component requires a real unified-diff PrFile.patch string and is
 *  wired to PR review-comment threading, not a plain two-body-versions diff.
 *  This uses the `diff` package's diffLines directly instead. */
export function diffBodies(oldBody: string, newBody: string): DiffLine[] {
  // ignoreNewlineAtEof: without it, a body missing a trailing newline diffs
  // every trailing line as remove+add even when only a line was appended —
  // a well-known jsdiff footgun for content that (like ours) rarely ends in \n.
  const parts = diffLines(oldBody, newBody, { ignoreNewlineAtEof: true });
  const lines: DiffLine[] = [];
  for (const part of parts) {
    const type: DiffLineType = part.added ? "add" : part.removed ? "remove" : "same";
    for (const raw of part.value.split("\n")) {
      if (raw === "") continue;
      lines.push({ type, value: raw });
    }
  }
  return lines;
}
