import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/classify.js';

/**
 * Pins the classifier's rule table (plan §0.4 "Ordering cases, traced") —
 * every case here is either a design-table example or a consequence of the
 * same boilerplate → tests → wiring → docs rule order.
 */
describe('classifyFile — rule-table ordering (plan §0.4)', () => {
  it.each<[string, SmartDiffRole]>([
    // The 8 design-table "Ordering cases" rows, in order:
    ['__tests__/__snapshots__/x.snap', 'boilerplate'], // __snapshots__ (boilerplate) is checked before __tests__ (tests)
    ['.claude/skills/security/SKILL.md', 'wiring'], // .claude/ (wiring) beats *.md (docs); no test/boilerplate rule matches
    // e2e/** (tests) is checked before README*/*.md (docs) — this is the
    // user's deliberate decision (plan §0.4), not an oversight.
    ['e2e/README.md', 'tests'],
    ['pnpm-lock.yaml', 'boilerplate'],
    ['client/src/components/index.ts', 'wiring'],
    ['server/src/modules/pulls/service.ts', 'core'],
    ['docs/x.md', 'docs'],
    ['e2e/playwright.config.ts', 'tests'], // tests precedes wiring's *.config.*

    // Additional cases from T7's acceptance list:
    ['.claude/hooks/tests/x.sh', 'tests'], // tests/ (tests) beats .claude/ (wiring)
    ['src/config.ts', 'core'], // no rule matches — falls through to the default
    ['server/dist/app.js', 'boilerplate'], // dist/ any-depth (A3)
    ['client\\src\\x.test.tsx', 'tests'], // backslashes normalized to `/` before matching
    ['./README.md', 'docs'], // leading `./` stripped before matching
  ])('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
