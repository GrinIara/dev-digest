import { describe, it, expect } from 'vitest';
import { docTypeFor, isDiscoverable, isSafePath } from '../src/modules/_shared/project-docs.js';
import { resolveEffectiveOrder, rootLabels } from '../src/modules/project-context/helpers.js';

const dirs = ['specs', 'docs', 'insights'] as const;

describe('SPEC-2026-09-29-project-context', () => {
  it('AC-2: nearest root segment decides the type', () => {
    expect(docTypeFor('docs/specs/x.md', dirs)).toBe('specs');
    expect(docTypeFor('specs/docs/y.md', dirs)).toBe('docs');
  });

  it('D1: README.md at any depth is discoverable and typed docs; other md outside roots is not', () => {
    expect(docTypeFor('README.md', dirs)).toBe('docs');
    expect(docTypeFor('server/README.md', dirs)).toBe('docs');
    expect(docTypeFor('specs/README.md', dirs)).toBe('specs');
    expect(isDiscoverable('src/notes.md', dirs)).toBe(false);
    expect(isDiscoverable('server/README.md', dirs)).toBe(true);
    expect(isDiscoverable('docs/a.MD', dirs)).toBe(true);
    expect(isDiscoverable('docs.md', dirs)).toBe(false);
    expect(rootLabels(dirs)).toEqual(['specs/', 'docs/', 'insights/', 'README.md']);
  });

  it('A2: unsafe path characters are never discoverable', () => {
    expect(isSafePath('docs/a"b.md')).toBe(false);
    expect(isSafePath('docs/a<b>.md')).toBe(false);
    expect(isSafePath('docs/a\nb.md')).toBe(false);
    expect(isDiscoverable('docs/a"b.md', dirs)).toBe(false);
    expect(isDiscoverable('x"/README.md', dirs)).toBe(false);
  });

  it('AC-33: effective order is agent first, then skills, first occurrence wins', () => {
    const out = resolveEffectiveOrder(
      ['a', 'b'],
      [
        { id: 's1', name: 'S1', paths: ['b', 'c'] },
        { id: 's2', name: 'S2', paths: ['c', 'd'] },
      ],
    );
    expect(out.map((e) => e.path)).toEqual(['a', 'b', 'c', 'd']);
    expect(out[1]?.source).toEqual({ kind: 'agent' });
    expect(out[2]?.source).toEqual({ kind: 'skill', id: 's1', name: 'S1' });
    expect(out[3]?.source).toEqual({ kind: 'skill', id: 's2', name: 'S2' });
  });
});
