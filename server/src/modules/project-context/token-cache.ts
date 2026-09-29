/** Per-file token counts keyed by repo + path, invalidated by (mtimeMs, size). */
const MAX_ENTRIES = 10_000;

const cache = new Map<string, { mtimeMs: number; size: number; tokens: number }>();

export const cacheKey = (repoId: string, path: string): string => `${repoId}\0${path}`;

/** Returns the cached count, else runs `compute` (null = unreadable, not cached). */
export async function getOrCount(
  key: string,
  mtimeMs: number,
  size: number,
  compute: () => Promise<number | null>,
): Promise<number | null> {
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return hit.tokens;
  const tokens = await compute();
  if (tokens === null) return null;
  cache.delete(key);
  cache.set(key, { mtimeMs, size, tokens });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return tokens;
}
