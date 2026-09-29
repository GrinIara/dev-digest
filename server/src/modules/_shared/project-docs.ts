/**
 * Pure discovery rules for Project Context docs (no I/O). Shared by
 * modules/project-context and modules/repo-intel (resync pre-check).
 */
import type { ContextDocType } from '@devdigest/shared';

export const README_NAME = 'README.md';

const UNSAFE_PATH_CHARS = new Set(['"', '<', '>', '\\']);

/** A2: the path is rendered inside a `source="…"` attribute, so reject unsafe characters. */
export function isSafePath(path: string): boolean {
  for (const ch of path) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || UNSAFE_PATH_CHARS.has(ch)) return false;
  }
  return true;
}

export function docName(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

function dirSegments(path: string): string[] {
  return path.split('/').slice(0, -1);
}

function isMarkdown(path: string): boolean {
  return docName(path).toLowerCase().endsWith('.md');
}

/** True when some directory segment (not the file name) is one of the configured roots. */
export function isUnderRoots(path: string, dirs: readonly string[]): boolean {
  return dirSegments(path).some((s) => dirs.includes(s));
}

/** D1: markdown under a configured root folder, or a README.md at any depth. */
export function isDiscoverable(path: string, dirs: readonly string[]): boolean {
  if (!isSafePath(path)) return false;
  return (isMarkdown(path) && isUnderRoots(path, dirs)) || docName(path) === README_NAME;
}

/** Nearest configured directory segment (right to left); README.md elsewhere → 'docs'. */
export function docTypeFor(path: string, dirs: readonly string[]): ContextDocType | null {
  const segs = dirSegments(path);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i] as string;
    if (dirs.includes(s)) return s as ContextDocType;
  }
  return docName(path) === README_NAME ? 'docs' : null;
}
