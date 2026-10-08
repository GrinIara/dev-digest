/** Pure helpers for Project Context discovery and effective ordering (no I/O). */
import { README_NAME } from '../_shared/project-docs.js';

export function docDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function rootLabels(dirs: readonly string[]): string[] {
  return [...dirs.map((d) => `${d}/`), README_NAME];
}

export type EffectiveSource = { kind: 'agent' } | { kind: 'skill'; id: string; name: string };
export interface EffectiveDoc {
  path: string;
  source: EffectiveSource;
}

/** Agent's own docs first, then skills in the given order; the first occurrence of a path wins. */
export function resolveEffectiveOrder(
  own: string[],
  skills: { id: string; name: string; paths: string[] }[],
): EffectiveDoc[] {
  const seen = new Set<string>();
  const out: EffectiveDoc[] = [];
  for (const path of own) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, source: { kind: 'agent' } });
  }
  for (const s of skills) {
    for (const path of s.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, source: { kind: 'skill', id: s.id, name: s.name } });
    }
  }
  return out;
}
