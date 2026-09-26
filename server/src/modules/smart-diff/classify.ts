import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES } from './constants.js';

/**
 * Classifies a file path into a Smart Diff role using the ordered regex
 * table in `constants.ts`. Pure, deterministic, dependency-free.
 */
export function classifyFile(path: string): SmartDiffRole {
  const p = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  for (const rule of CLASSIFY_RULES) {
    // No `g` flag on any pattern in CLASSIFY_RULES — a global regex's
    // `lastIndex` state would make repeated `test()` calls non-deterministic.
    if (rule.patterns.some((re) => re.test(p))) return rule.role;
  }
  return 'core';
}
