import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the four built-in agents (General + Security +
 * Performance + Test Quality), all on the default openrouter/deepseek-v4-flash
 * provider+model. Also seeds the Skills Lab control-experiment fixtures: 4
 * test-quality rubric skills bound to Test Quality Reviewer (3 manual, 1
 * imported from an e2e fixture .md), an api-breaking-change-detection skill
 * bound to General Reviewer, and one eval_case per experiment.
 *
 * Course lessons populate the other tables (conventions, memory, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Reviews the test code in a diff for coverage gaps, weak assertions, and flakiness risk.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  const [testQualityReviewer] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  const [generalReviewer] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));

  // ---- Skills Lab demo data (control experiments) ----
  // Skill schema/API landed once the feature was built; this seeds the two
  // control experiments the Skills Lab is meant to demonstrate: (1) a Test
  // Quality Reviewer whose 4 bound rubric skills light up on a happy-path-only
  // test PR, and (2) an api-breaking-change-detection skill bound onto the
  // existing General Reviewer.
  async function ensureSkill(input: {
    name: string;
    description: string;
    type: 'rubric' | 'convention' | 'security' | 'custom';
    source: 'manual' | 'imported_url' | 'extracted' | 'community';
    body: string;
  }): Promise<typeof t.skills.$inferSelect> {
    let [row] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, input.name)));
    if (!row) {
      [row] = await db.insert(t.skills).values({ workspaceId, ...input }).returning();
      await db.insert(t.skillVersions).values({
        skillId: row!.id,
        version: 1,
        body: input.body,
        changeSummary: 'Initial version',
      });
    }
    return row!;
  }

  async function ensureLinked(agentId: string, skillId: string, order: number): Promise<void> {
    await db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({ target: [t.agentSkills.agentId, t.agentSkills.skillId], set: { order } });
  }

  // `---\nname: x\ndescription: y\n---\nbody` — same convention as this repo's
  // own .claude/skills SKILL.md frontmatter.
  function parseSkillFrontmatter(raw: string): { name: string; description: string; body: string } {
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!m) return { name: 'imported-skill', description: '', body: raw.trim() };
    const [, front, body] = m;
    const name = /^name:\s*(.+)$/m.exec(front!)?.[1]?.trim() ?? 'imported-skill';
    const description = /^description:\s*(.+)$/m.exec(front!)?.[1]?.trim() ?? '';
    return { name, description, body: body!.trim() };
  }

  const testBranchCoverage = await ensureSkill({
    name: 'test-branch-coverage',
    description: 'Flags new/changed conditional branches (if/else, switch, early returns, error paths) with no test exercising them.',
    type: 'rubric',
    source: 'manual',
    body: '# Test branch coverage\n\nFor every new or changed conditional branch in the diff (an `if`/`else`, a\n`switch` case, an early return, or a thrown error path), check whether a test\nin the same diff exercises that branch. Flag any branch with none.\n\nA WARNING for a non-error branch left untested; a CRITICAL for an error path\n(a thrown exception, a rejected promise, an early-return failure case) with\nno test — those are exactly the paths most likely to regress silently.',
  });
  const testCornerCases = await ensureSkill({
    name: 'test-corner-cases',
    description: 'Flags missing tests for boundary/edge inputs: empty, null/undefined, zero, negative, max values, empty collections.',
    type: 'rubric',
    source: 'manual',
    body: '# Test corner cases\n\nFor every new/changed function that takes a number, string, or collection,\ncheck whether the diff\'s tests cover its boundary inputs: `0`/negative/max\nfor numbers, `""`/`null`/`undefined` for strings, and the empty-collection\ncase for arrays/objects. Flag any boundary the production code visibly\nbranches on (a guard clause, a `.length === 0` check, a range check) that has\nno corresponding test.\n\nWARNING for a plausible-but-unlikely boundary; CRITICAL when the production\ncode has an explicit guard for a boundary and NO test exercises that guard.',
  });
  const testExcessiveMocking = await ensureSkill({
    name: 'test-excessive-mocking',
    description: 'Flags over-mocking: mocking the unit under test, asserting mock call counts instead of behavior, or mocking so many collaborators the test verifies nothing real.',
    type: 'rubric',
    source: 'manual',
    body: '# Test excessive mocking\n\nFlag a test that:\n- Mocks the very function/module it claims to be testing (the assertion then\n  only proves the mock was called, not that the real code works).\n- Asserts primarily on mock call counts/arguments (`toHaveBeenCalledWith`)\n  instead of on the resulting behavior or return value.\n- Mocks so many collaborators that little of the real code path executes —\n  ask: if every mocked dependency were subtly broken, would this test still\n  pass? If yes, it is over-mocked.\n\nWARNING for a test that leans on mock-call assertions where a behavioral\nassertion was feasible; CRITICAL when the unit under test itself is mocked,\nmaking the test tautological.',
  });
  const testFlakinessFixture = readFileSync(
    fileURLToPath(new URL('../../../e2e/specs/fixtures/skill-test-flakiness.md', import.meta.url)),
    'utf8',
  );
  const parsedFlakiness = parseSkillFrontmatter(testFlakinessFixture);
  const testFlakiness = await ensureSkill({
    name: parsedFlakiness.name,
    description: parsedFlakiness.description,
    type: 'rubric',
    source: 'extracted',
    body: parsedFlakiness.body,
  });

  if (testQualityReviewer) {
    await ensureLinked(testQualityReviewer.id, testBranchCoverage.id, 0);
    await ensureLinked(testQualityReviewer.id, testCornerCases.id, 1);
    await ensureLinked(testQualityReviewer.id, testExcessiveMocking.id, 2);
    await ensureLinked(testQualityReviewer.id, testFlakiness.id, 3);
  }

  const apiBreakingChangeDetection = await ensureSkill({
    name: 'api-breaking-change-detection',
    description: 'Flags an unannounced breaking change to a route\'s request/response contract (shape, type, nullability, status code) with no compensating note.',
    type: 'convention',
    source: 'manual',
    body: '# API breaking-change detection\n\nFlag a diff that changes a route\'s request or response contract in a way\nthat breaks existing callers, with no compensating update visible in the same\ndiff (no version bump, no deprecation period, no migration note in the PR\ndescription):\n- A response field removed, renamed, or its type/nullability changed.\n- A request field that was optional becoming required (or vice versa in a way\n  that changes validation behavior callers rely on).\n- An HTTP status code or error-shape change for an existing case.\n- An enum value removed (not just added).\n\nThis is a correctness issue, not a style one — an unannounced contract change\nbreaks every existing caller at once. CRITICAL when the change is a hard\nbreak (removed/renamed field, added required field) with no compensating\nnote; WARNING when the change is additive-but-risky or the compensating note\nis present but weak.',
  });
  if (generalReviewer) {
    const existingGeneralLinks = await db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, generalReviewer.id));
    await ensureLinked(generalReviewer.id, apiBreakingChangeDetection.id, existingGeneralLinks.length);
  }

  // ---- eval_cases for the two control experiments (A.10) ----
  async function ensureEvalCase(input: {
    ownerKind: 'skill' | 'agent';
    ownerId: string;
    name: string;
    inputDiff: string;
    expectedOutput?: unknown;
    notes?: string;
  }): Promise<void> {
    const [existing] = await db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerId, input.ownerId), eq(t.evalCases.name, input.name)));
    if (existing) return;
    await db.insert(t.evalCases).values({
      workspaceId,
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      name: input.name,
      inputDiff: input.inputDiff,
      expectedOutput: input.expectedOutput,
      notes: input.notes,
    });
  }

  if (testQualityReviewer) {
    await ensureEvalCase({
      ownerKind: 'agent',
      ownerId: testQualityReviewer.id,
      name: 'Happy-path-only test PR',
      notes:
        'Control experiment: with the 4 test-quality skills disabled, expect a clean/skip result. ' +
        'With them enabled, expect findings citing the untested error branch (test-branch-coverage) ' +
        'AND the untested price<=0 corner case (test-corner-cases) as two distinct findings.',
      inputDiff: [
        'diff --git a/src/pricing/discount.ts b/src/pricing/discount.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/src/pricing/discount.ts',
        '@@ -0,0 +1,4 @@',
        '+export function applyDiscount(price: number, pct: number): number {',
        "+  if (pct < 0 || pct > 100) throw new Error('pct out of range');",
        '+  if (price <= 0) return 0;',
        '+  return Math.round(price * (1 - pct / 100) * 100) / 100;',
        '+}',
        'diff --git a/src/pricing/discount.test.ts b/src/pricing/discount.test.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/src/pricing/discount.test.ts',
        '@@ -0,0 +1,7 @@',
        "+import { describe, it, expect } from 'vitest';",
        "+import { applyDiscount } from './discount';",
        '+',
        "+describe('applyDiscount', () => {",
        "+  it('applies a 10% discount', () => {",
        '+    expect(applyDiscount(100, 10)).toBe(90);',
        '+  });',
        '+});',
        '',
      ].join('\n'),
      expectedOutput: { min_findings: 2 },
    });
  }

  if (generalReviewer) {
    await ensureEvalCase({
      ownerKind: 'agent',
      ownerId: generalReviewer.id,
      name: 'Breaking route response shape change',
      notes:
        'Control experiment: without api-breaking-change-detection bound, expect skip/no finding on the ' +
        'removed field. With it bound, expect a breaking-change finding.',
      inputDiff: [
        'diff --git a/src/api/users.ts b/src/api/users.ts',
        '--- a/src/api/users.ts',
        '+++ b/src/api/users.ts',
        '@@ -40,8 +40,7 @@ export async function getUser(req, reply) {',
        '   const user = await db.query.users.findFirst({ where: eq(users.id, req.params.id) });',
        '   if (!user) return reply.code(404).send();',
        '-  return reply.send({ id: user.id, email: user.email, name: user.name });',
        '+  return reply.send({ id: user.id, email: user.email });',
        ' }',
        '',
      ].join('\n'),
      expectedOutput: { min_findings: 1 },
    });
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
