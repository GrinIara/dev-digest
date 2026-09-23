import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseMarkdownFrontmatter, parseZipImport } from '../src/modules/skills/helpers.js';

/**
 * Unit tests for the skills import parser (parse-only — no DB, no I/O beyond
 * bytes already in memory). Covers the `.md` frontmatter path and the zip
 * path (SKILL.md discovery + discarding every other archive entry unread).
 */

describe('parseMarkdownFrontmatter', () => {
  it('parses a flat frontmatter block into name/description/body', () => {
    const content = ['---', 'name: My Skill', 'description: A test skill', '---', '', 'The body text.', 'More body.'].join(
      '\n',
    );
    const draft = parseMarkdownFrontmatter(content);
    expect(draft).toEqual({
      name: 'My Skill',
      description: 'A test skill',
      body: 'The body text.\nMore body.',
    });
  });

  it('treats content with no frontmatter block as body-only', () => {
    const draft = parseMarkdownFrontmatter('Just a body, no frontmatter.');
    expect(draft).toEqual({ name: '', description: '', body: 'Just a body, no frontmatter.' });
  });
});

describe('parseZipImport', () => {
  it('finds SKILL.md and discards every other archive entry unread', () => {
    const archive = zipSync({
      'SKILL.md': strToU8(['---', 'name: Zipped Skill', 'description: From a zip', '---', 'Zip body.'].join('\n')),
      'scripts/run.sh': strToU8('#!/bin/sh\nrm -rf /\n'),
      'notes.txt': strToU8('irrelevant'),
    });
    const base64 = Buffer.from(archive).toString('base64');
    const draft = parseZipImport(base64);
    expect(draft).toEqual({ name: 'Zipped Skill', description: 'From a zip', body: 'Zip body.' });
  });

  it('falls back to the only root-level .md file when there is no SKILL.md', () => {
    const archive = zipSync({
      'my-skill.md': strToU8(['---', 'name: Root Skill', 'description: desc', '---', 'Root body.'].join('\n')),
      'other/nested.md': strToU8('nested, not root-level'),
    });
    const base64 = Buffer.from(archive).toString('base64');
    const draft = parseZipImport(base64);
    expect(draft.name).toBe('Root Skill');
    expect(draft.body).toBe('Root body.');
  });

  it('throws when the archive has no SKILL.md and multiple root-level .md files', () => {
    const archive = zipSync({
      'a.md': strToU8('a'),
      'b.md': strToU8('b'),
    });
    const base64 = Buffer.from(archive).toString('base64');
    expect(() => parseZipImport(base64)).toThrow();
  });

  it('throws on an invalid zip payload', () => {
    expect(() => parseZipImport(Buffer.from('not a zip').toString('base64'))).toThrow();
  });
});
