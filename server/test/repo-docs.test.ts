import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { FsRepoDocs } from '../src/adapters/repo-docs/index.js';
import { RepoDocPathError } from '../src/adapters/repo-docs/port.js';
import { MockRepoDocs } from '../src/adapters/mocks.js';

const repo = { owner: 'acme', name: 'app' };

let base: string;
let outside: string;
let root: string;
let docs: FsRepoDocs;

async function put(rel: string, content: string | Buffer) {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, content);
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'repo-docs-'));
  outside = await mkdtemp(join(tmpdir(), 'repo-docs-out-'));
  docs = new FsRepoDocs(base);
  root = docs.clonePathFor(repo);
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('FsRepoDocs.listMarkdown', () => {
  it('finds docs under specs/docs/insights and READMEs at any depth', async () => {
    await put('.devdigest/specs/a.md', 'a');
    await put('docs/b.md', 'b');
    await put('insights/c.md', 'c');
    await put('README.md', 'r');
    await put('server/README.md', 'r2');
    await put('src/app.ts', 'x');
    const paths = (await docs.listMarkdown(repo)).map((f) => f.path);
    expect(paths).toEqual([
      '.devdigest/specs/a.md',
      'README.md',
      'docs/b.md',
      'insights/c.md',
      'server/README.md',
    ]);
    const first = (await docs.listMarkdown(repo))[0]!;
    expect(first.size).toBe(1);
    expect(first.mtimeMs).toBeGreaterThan(0);
  });

  it('skips node_modules, .git and symlinked files', async () => {
    await put('node_modules/x/docs/d.md', 'd');
    await put('node_modules/x/README.md', 'r');
    await put('.git/notes.md', 'g');
    await put('docs/ok.md', 'ok');
    await writeFile(join(outside, 'secret.md'), 'secret');
    await symlink(join(outside, 'secret.md'), join(root, 'docs', 'link.md'));
    const paths = (await docs.listMarkdown(repo)).map((f) => f.path);
    expect(paths).toEqual(['docs/ok.md']);
  });

  it('skips paths with unsafe characters', async () => {
    await put('docs/we<ird>.md', 'x');
    await put('docs/fine.md', 'x');
    const paths = (await docs.listMarkdown(repo)).map((f) => f.path);
    expect(paths).toEqual(['docs/fine.md']);
  });
});

describe('FsRepoDocs.read', () => {
  it('reads a regular doc', async () => {
    await put('docs/a.md', 'héllo');
    const r = await docs.read(repo, 'docs/a.md');
    expect(r).toMatchObject({ ok: true, text: 'héllo' });
  });

  it('returns unreadable for a symlink to a file outside the clone', async () => {
    await writeFile(join(outside, 'secret.md'), 'secret');
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(root, 'docs', 'link.md'));
    expect(await docs.read(repo, 'docs/link.md')).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('returns unreadable for a directory symlink escaping the clone', async () => {
    await writeFile(join(outside, 'secret.md'), 'secret');
    await symlink(outside, join(root, 'esc'));
    expect(await docs.read(repo, 'esc/secret.md')).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('returns unreadable for invalid UTF-8', async () => {
    await put('docs/bad.md', Buffer.from([0xff, 0xfe, 0xfd, 0x80]));
    expect(await docs.read(repo, 'docs/bad.md')).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('returns missing for a non-existent file', async () => {
    expect(await docs.read(repo, 'docs/none.md')).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects traversal, absolute and backslash paths', async () => {
    await expect(docs.read(repo, '../x.md')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(docs.read(repo, 'docs/../../x.md')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(docs.read(repo, '/etc/passwd')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(docs.read(repo, 'docs\\a.md')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(docs.read(repo, 'docs/a\0.md')).rejects.toBeInstanceOf(RepoDocPathError);
  });
});

describe('FsRepoDocs.write', () => {
  it('refuses a non-existent doc, a non-.md file and a symlinked .md', async () => {
    await put('src/app.ts', 'code');
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(outside, 'target.md'), 'orig');
    await symlink(join(outside, 'target.md'), join(root, 'docs-link.md'));
    await expect(docs.write(repo, 'specs/new.md', 'x')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(docs.write(repo, 'src/app.ts', 'x')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(docs.write(repo, 'docs-link.md', 'x')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(docs.write(repo, '../escape.md', 'x')).rejects.toBeInstanceOf(RepoDocPathError);
    expect(await readFile(join(outside, 'target.md'), 'utf8')).toBe('orig');
    expect(await readFile(join(root, 'src/app.ts'), 'utf8')).toBe('code');
  });

  it('writes atomically to an existing doc and leaves no temp file', async () => {
    await put('docs/a.md', 'old');
    const res = await docs.write(repo, 'docs/a.md', 'néw');
    expect(res.bytes).toBe(Buffer.byteLength('néw'));
    expect(await readFile(join(root, 'docs/a.md'), 'utf8')).toBe('néw');
    expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
  });
});

describe('FsRepoDocs.modifiedPaths', () => {
  it('returns the edited tracked doc only, not an untracked new file', async () => {
    await put('docs/a.md', 'one');
    await put('docs/b.md', 'two');
    const git = simpleGit(root);
    await git.init();
    await git.addConfig('user.email', 't@example.com');
    await git.addConfig('user.name', 'T');
    await git.addConfig('commit.gpgsign', 'false');
    await git.add('.');
    await git.commit('init');
    await docs.write(repo, 'docs/a.md', 'changed');
    await put('docs/new.md', 'untracked');
    expect(await docs.modifiedPaths(repo)).toEqual(['docs/a.md']);
  });
});

describe('MockRepoDocs', () => {
  it('mirrors the write contract', async () => {
    const m = new MockRepoDocs({ 'docs/a.md': 'a', 'src/x.ts': 'x' });
    await expect(m.write(repo, 'docs/new.md', 'x')).rejects.toBeInstanceOf(RepoDocPathError);
    await expect(m.write(repo, 'src/x.ts', 'x')).rejects.toBeInstanceOf(RepoDocPathError);
    expect(await m.write(repo, 'docs/a.md', 'zz')).toEqual({ bytes: 2 });
    expect(await m.modifiedPaths(repo)).toEqual(['docs/a.md']);
    expect(m.writes).toEqual([{ path: 'docs/a.md', bytes: 2 }]);
  });
});
