/**
 * repo-docs adapter — the one confined filesystem chokepoint for Project Context
 * (list / read / write markdown docs inside a repo clone, plus the git
 * "modified tracked docs" signal).
 *
 * Server-local port (like adapters/tokenizer). Every path that reaches the disk
 * goes through `confine()`: no absolute paths, `..`, backslashes or NUL, the
 * clone root and the target's parent are `realpath`-resolved and must stay
 * inside the root, and symlink targets are refused. Discovery rules (roots,
 * README filtering) live in the service, not here.
 */
import { join, resolve, dirname, basename, extname, sep, isAbsolute } from 'node:path';
import { readdir, lstat, readFile, writeFile, rename, unlink, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { simpleGit } from 'simple-git';
import type { RepoRef } from '@devdigest/shared';
import {
  RepoDocPathError,
  type RepoDocFile,
  type RepoDocRead,
  type RepoDocs,
} from './port.js';

// Paths we never list: quotes/angle brackets/backslash (prompt-tag breakout, A2)
// and control characters.
const UNSAFE_PATH_CHARS = new Set(['"', '<', '>', '\\']);

function hasUnsafeChar(p: string): boolean {
  for (const ch of p) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || UNSAFE_PATH_CHARS.has(ch)) return true;
  }
  return false;
}
const SKIP_DIRS = new Set(['node_modules', '.git']);

const isMarkdown = (p: string): boolean => extname(p).toLowerCase() === '.md';

function isInside(realRoot: string, p: string): boolean {
  return p === realRoot || p.startsWith(realRoot + sep);
}

export class FsRepoDocs implements RepoDocs {
  constructor(private cloneDir: string) {}

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  async listMarkdown(repo: RepoRef): Promise<RepoDocFile[]> {
    const root = this.clonePathFor(repo);
    const out: RepoDocFile[] = [];
    const walk = async (dirAbs: string, dirRel: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dirAbs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          await walk(join(dirAbs, entry.name), rel);
        } else if (entry.isFile() && isMarkdown(entry.name)) {
          if (hasUnsafeChar(rel)) continue;
          try {
            const st = await lstat(join(dirAbs, entry.name));
            out.push({ path: rel, size: st.size, mtimeMs: st.mtimeMs });
          } catch {
            // vanished between readdir and lstat — skip
          }
        }
      }
    };
    await walk(root, '');
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /**
   * Resolve `rel` under the clone root and verify it cannot escape (lexically,
   * via the parent directory's realpath, or by being a symlink itself).
   * Returns the absolute target and its lstat (null when it does not exist).
   */
  private async confine(root: string, rel: string) {
    if (
      typeof rel !== 'string' ||
      rel.length === 0 ||
      isAbsolute(rel) ||
      rel.includes('\0') ||
      rel.includes('\\') ||
      rel.split('/').some((seg) => seg === '..')
    ) {
      throw new RepoDocPathError(`Invalid doc path: ${JSON.stringify(rel)}`, 'invalid');
    }
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      throw new RepoDocPathError('Repository clone not found', 'not_found');
    }
    const target = resolve(realRoot, rel);
    if (!isInside(realRoot, target) || target === realRoot) {
      throw new RepoDocPathError('Path escapes the repository', 'outside');
    }
    let realParent: string;
    try {
      realParent = await realpath(dirname(target));
    } catch {
      throw new RepoDocPathError('Doc not found', 'not_found');
    }
    if (!isInside(realRoot, realParent)) {
      throw new RepoDocPathError('Path escapes the repository', 'outside');
    }
    let st: Awaited<ReturnType<typeof lstat>> | null = null;
    try {
      st = await lstat(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    if (st?.isSymbolicLink()) {
      throw new RepoDocPathError('Symlinks are not allowed', 'symlink');
    }
    return { target, st };
  }

  async read(repo: RepoRef, path: string): Promise<RepoDocRead> {
    let confined;
    try {
      confined = await this.confine(this.clonePathFor(repo), path);
    } catch (err) {
      if (err instanceof RepoDocPathError) {
        if (err.reason === 'not_found') return { ok: false, reason: 'missing' };
        if (err.reason === 'outside' || err.reason === 'symlink') {
          return { ok: false, reason: 'unreadable' };
        }
      }
      throw err;
    }
    const { target, st } = confined;
    if (!st || !st.isFile()) return { ok: false, reason: 'missing' };
    try {
      const buf = await readFile(target);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { ok: true, text, size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  }

  async write(repo: RepoRef, path: string, content: string): Promise<{ bytes: number }> {
    const { target, st } = await this.confine(this.clonePathFor(repo), path);
    if (!isMarkdown(target)) {
      throw new RepoDocPathError('Only .md files can be written', 'not_markdown');
    }
    if (!st || !st.isFile()) {
      throw new RepoDocPathError('Doc does not exist', 'not_found');
    }
    const tmp = join(dirname(target), `.${basename(target)}.devdigest-tmp-${randomUUID()}`);
    try {
      await writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });
      await rename(tmp, target);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    return { bytes: Buffer.byteLength(content, 'utf8') };
  }

  async modifiedPaths(repo: RepoRef): Promise<string[]> {
    const status = await simpleGit(this.clonePathFor(repo)).status();
    return status.modified.map((p) => p.split('\\').join('/'));
  }
}
