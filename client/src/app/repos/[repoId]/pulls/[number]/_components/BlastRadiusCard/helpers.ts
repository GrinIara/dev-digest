import type { BlastCaller, ChangedSymbol } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

/** `repoFullName` is null until `useActiveRepo` resolves — render plain text then (R7/T5 risk a). */
export function callerHref(repoFullName: string | null, sha: string, c: BlastCaller): string | null {
  return repoFullName ? githubBlobUrl(repoFullName, sha, c.file, c.line) : null;
}

export function kindOf(changed: ChangedSymbol[], name: string): string | null {
  return changed.find((c) => c.name === name)?.kind ?? null;
}

export function displayName(name: string, kind: string | null): string {
  return kind === "function" || kind === "method" ? `${name}()` : name;
}
