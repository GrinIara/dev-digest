import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff classifier rule table.
 *
 * Anchoring convention (A3, plan §0.4):
 *  - Basename-only globs (no `/`) match the last path segment at any depth,
 *    via a `(?:^|\/)` prefix or a `$`-anchored suffix.
 *  - `dir/**` globs match that directory at any depth, via `(?:^|\/)dir\/`.
 *    This matters in this multi-package repo (`server/dist/…`,
 *    `client/src/test/…`, `e2e/…` must all match their any-depth rule).
 *
 * Rule order is boilerplate → tests → wiring → docs; the first match wins,
 * `core` is the default. One ordering decision worth recording: `e2e/README.md`
 * matches the tests rule (`e2e/**`) before the docs rules (`README*`/`*.md`),
 * because tests is checked before docs — this is a deliberate user decision
 * (plan §0.4), not an oversight.
 */

export const SMART_DIFF_ROLE_ORDER = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const satisfies readonly SmartDiffRole[];

export const CLASSIFY_RULES: readonly {
  role: Exclude<SmartDiffRole, 'core'>;
  patterns: readonly RegExp[];
}[] = [
  {
    role: 'boilerplate',
    patterns: [
      /\.lock$/,
      /(?:^|\/)pnpm-lock\.yaml$/,
      /(?:^|\/)package-lock\.json$/,
      /(?:^|\/)yarn\.lock$/,
      /(?:^|\/)dist\//,
      /(?:^|\/)build\//,
      /(?:^|\/)__snapshots__\//,
      /\.snap$/,
      /\.generated\.[^/]+$/,
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/,
      /\.it\.test\.ts$/,
      /\.spec\.ts$/,
      /(?:^|\/)test\//,
      /(?:^|\/)tests\//,
      /(?:^|\/)__tests__\//,
      /(?:^|\/)e2e\//,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(?:^|\/)index\.[jt]s$/,
      /\.config\.[^/]+$/,
      /(?:^|\/)tsconfig[^/]*\.json$/,
      /(?:^|\/)\.eslintrc[^/]*$/,
      /(?:^|\/)\.env[^/]*$/,
      /(?:^|\/)docker-compose[^/]*\.yml$/,
      /(?:^|\/)\.github\//,
      /(?:^|\/)\.claude\//,
    ],
  },
  {
    role: 'docs',
    patterns: [
      /\.md$/,
      /(?:^|\/)docs\//,
      /(?:^|\/)README[^/]*$/,
      /(?:^|\/)CHANGELOG[^/]*$/,
      /(?:^|\/)LICENSE$/,
    ],
  },
];
