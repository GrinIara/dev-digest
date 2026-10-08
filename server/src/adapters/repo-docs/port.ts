/**
 * repo-docs port — the RepoDocs contract, its result types and the path error.
 * Neutral (no fs / git imports) so services, mocks and the container can depend
 * on it without touching the filesystem adapter.
 */
import type { RepoRef } from '@devdigest/shared';

export interface RepoDocFile {
  path: string;
  size: number;
  mtimeMs: number;
}

export type RepoDocRead =
  | { ok: true; text: string; size: number; mtimeMs: number }
  | { ok: false; reason: 'missing' | 'unreadable' };

export interface RepoDocs {
  clonePathFor(repo: RepoRef): string;
  listMarkdown(repo: RepoRef): Promise<RepoDocFile[]>;
  read(repo: RepoRef, path: string): Promise<RepoDocRead>;
  write(repo: RepoRef, path: string, content: string): Promise<{ bytes: number }>;
  modifiedPaths(repo: RepoRef): Promise<string[]>;
}

export type RepoDocPathErrorReason = 'invalid' | 'outside' | 'symlink' | 'not_markdown' | 'not_found';

/** Thrown when a path fails confinement or a write precondition. */
export class RepoDocPathError extends Error {
  constructor(
    message: string,
    readonly reason: RepoDocPathErrorReason,
  ) {
    super(message);
    this.name = 'RepoDocPathError';
  }
}
