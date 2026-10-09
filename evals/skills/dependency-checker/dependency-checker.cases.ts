import type { SkillCase } from "../../src/index.js";

// Quality cases run content-only with no tools (see tasks.ts), so the skill can't run its own
// collector script. Each prompt inlines collector-style data plus raw grep hits.
//
// The data is deliberately RAWER than what .claude/skills/dependency-checker/scripts/collect-deps.mjs
// writes: the collector precomputes `inProd`/`reachedVia`, `lockfileDrift` and `sharedDeps.majorDrift`,
// and with those present a raw model passes most practices too (the first benchmark flagged them
// non_discriminating). Here those conclusions are removed and only the underlying facts stay —
// audit dependency paths, lockfile names + node_modules layout, per-package versions, grep hits —
// so the cases measure the SKILL.md's reasoning (reach-based priorities, heuristic verification,
// drift detection), not the script's precomputed flags.
//
// Traps, each separating the skill from a raw model:
//   - critical advisories that only reach dev deps (vitest → tinypool) vs a high one in prod (fastify)
//   - a critical advisory under a `dependencies` entry of `evals`, which is tooling and never deployed
//   - the same vitest advisories repeated across five packages (one action, not five)
//   - identical versions installed per package (by design) vs one real zod major drift
//   - unused "candidates" that are actually used (peer / scoped sibling) vs one truly unused dep
//   - an npm lockfile next to a pnpm-installed node_modules in one package

const MB = 1024 * 1024;

const dep = (
  name: string,
  kind: "prod" | "dev",
  installedVersion: string,
  ownMB: number,
  closureMB: number,
  closurePackages: number,
  referencedInSource = true,
) => ({
  name,
  kind,
  spec: `^${installedVersion}`,
  installedVersion,
  ownBytes: Math.round(ownMB * MB),
  closureBytes: Math.round(closureMB * MB),
  closurePackages,
  license: "MIT",
  referencedInSource,
});

// Raw `pnpm audit` shape: `paths` start at the package root (".") and name the direct dep first.
const vitestAdvisories = [
  { name: "tinypool", severity: "critical", title: "Tinypool: Prototype Pollution Gadget to RCE in run() options", vulnerableVersions: "<2.1.2", patchedVersions: ">=2.1.2", url: "https://github.com/advisories/GHSA-85c8-ppgw-ccpr", paths: [".>vitest>tinypool"] },
  { name: "vitest", severity: "critical", title: "When Vitest UI server is listening, arbitrary file can be read and executed", vulnerableVersions: "<3.2.6", patchedVersions: ">=3.2.6", url: "https://github.com/advisories/GHSA-5xrq-8626-4rwp", paths: [".>vitest"] },
];

const COLLECTED = {
  generatedAt: "2026-10-08T09:00:00.000Z",
  gitHead: "b50ab5b",
  gitBranch: "feat/deps",
  offline: false,
  packages: [
    {
      path: "server",
      name: "@devdigest/api",
      lockfiles: ["pnpm-lock.yaml"],
      nodeModulesLayout: "node_modules/.pnpm present",
      nodeModulesBytes: 268 * MB,
      deps: [
        dep("js-tiktoken", "prod", "1.0.21", 21.3, 21.4, 2),
        dep("openai", "prod", "4.104.0", 4, 10.3, 39),
        dep("fastify", "prod", "5.8.5", 2.6, 6.9, 48),
        dep("zod", "prod", "3.25.76", 3.4, 3.4, 1),
        dep("simple-git", "prod", "3.36.0", 0.9, 1, 7),
        dep("@fastify/autoload", "prod", "6.3.1", 0.1, 0.1, 1, false),
        dep("@testcontainers/postgresql", "dev", "10.28.0", 0, 27.6, 158),
        dep("testcontainers", "dev", "10.28.0", 0.3, 27.6, 157, false),
        dep("typescript", "dev", "5.9.3", 22.5, 22.5, 1),
        dep("vitest", "dev", "2.1.9", 1.5, 21.6, 44),
      ],
      outdated: [
        { name: "fastify", current: "5.8.5", wanted: "5.12.5", latest: "5.12.5", dependencyType: "dependencies" },
        { name: "openai", current: "4.104.0", wanted: "4.104.0", latest: "7.30.0", dependencyType: "dependencies" },
        { name: "simple-git", current: "3.36.0", wanted: "3.36.0", latest: "4.0.2", dependencyType: "dependencies" },
        { name: "vitest", current: "2.1.9", wanted: "2.1.9", latest: "5.0.3", dependencyType: "devDependencies" },
      ],
      audit: {
        counts: { info: 0, low: 0, moderate: 0, high: 1, critical: 3 },
        items: [
          { name: "fastify", severity: "high", title: "fastify vulnerable to authentication bypass via malformed URLs reaching encapsulated routes", vulnerableVersions: ">=4.0.0 <5.12.2", patchedVersions: ">=5.12.2", url: "https://github.com/advisories/GHSA-p68q-wchp-6fh7", paths: [".>fastify"] },
          { name: "simple-git", severity: "critical", title: "simple-git unsafe-operation guard does not block trailer command configuration", vulnerableVersions: ">=3.15.0 <4.0.1", patchedVersions: ">=4.0.1", url: "https://github.com/advisories/GHSA-x6jw-m9v5-85vh", paths: [".>simple-git"] },
          ...vitestAdvisories,
        ],
      },
    },
    {
      path: "client",
      name: "@devdigest/web",
      lockfiles: ["pnpm-lock.yaml"],
      nodeModulesLayout: "node_modules/.pnpm present",
      nodeModulesBytes: 649 * MB,
      deps: [
        dep("next", "prod", "15.5.27", 133, 277.3, 18),
        dep("mermaid", "prod", "11.16.1", 72.8, 115.1, 111),
        dep("zod", "prod", "3.25.76", 3.4, 3.4, 1),
        dep("@tailwindcss/postcss", "dev", "4.3.0", 0, 15.7, 23),
        dep("postcss", "dev", "8.5.15", 0.1, 0.3, 4, false),
        dep("typescript", "dev", "5.9.3", 22.5, 22.5, 1),
        dep("vitest", "dev", "2.1.9", 1.5, 21.6, 44),
      ],
      outdated: [{ name: "vitest", current: "2.1.9", wanted: "2.1.9", latest: "5.0.3", dependencyType: "devDependencies" }],
      audit: { counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 2 }, items: [...vitestAdvisories] },
    },
    {
      path: "reviewer-core",
      name: "@devdigest/reviewer-core",
      lockfiles: ["package-lock.json"],
      nodeModulesLayout: "node_modules/.pnpm present",
      nodeModulesBytes: 212 * MB,
      deps: [
        dep("openai", "prod", "4.104.0", 4, 10.3, 39),
        dep("zod", "prod", "3.25.76", 3.4, 3.4, 1),
        dep("typescript", "dev", "5.9.3", 22.5, 22.5, 1),
        dep("vitest", "dev", "2.1.9", 1.5, 21.8, 44),
      ],
      outdated: [{ name: "vitest", current: "2.1.9", wanted: "2.1.9", latest: "5.0.3" }],
      audit: { counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 2 }, items: [...vitestAdvisories] },
    },
    {
      path: "mcp-server",
      name: "@devdigest/mcp-server",
      lockfiles: ["package-lock.json"],
      nodeModulesLayout: "node_modules/.package-lock.json present (npm)",
      nodeModulesBytes: 208 * MB,
      deps: [
        dep("@modelcontextprotocol/sdk", "prod", "1.32.1", 4.1, 13.8, 92),
        dep("zod", "prod", "4.1.12", 4.9, 4.9, 1),
        dep("typescript", "dev", "5.9.3", 22.5, 22.5, 1),
        dep("vitest", "dev", "2.1.9", 1.5, 21.8, 44),
      ],
      outdated: [{ name: "vitest", current: "2.1.9", wanted: "2.1.9", latest: "5.0.3" }],
      audit: { counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 2 }, items: [...vitestAdvisories] },
    },
    {
      path: "evals",
      name: "@devdigest/evals",
      lockfiles: ["pnpm-lock.yaml"],
      nodeModulesLayout: "node_modules/.pnpm present",
      nodeModulesBytes: 332 * MB,
      deps: [dep("@anthropic-ai/claude-agent-sdk", "prod", "0.3.198", 3.5, 222.2, 2), dep("vitest", "dev", "2.1.9", 1.5, 21.6, 44)],
      outdated: [{ name: "@anthropic-ai/claude-agent-sdk", current: "0.3.198", wanted: "0.3.293", latest: "0.3.293", dependencyType: "dependencies" }],
      audit: {
        counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 3 },
        items: [
          { name: "proxy-addr", severity: "critical", title: "proxy-addr: trust function bypass allows client IP spoofing", vulnerableVersions: "<2.0.8", patchedVersions: ">=2.0.8", url: "https://github.com/advisories/GHSA-0000-evals-demo", paths: [".>@anthropic-ai/claude-agent-sdk>@modelcontextprotocol/sdk>express>proxy-addr"] },
          ...vitestAdvisories,
        ],
      },
    },
  ],
  internalEdges: [
    { from: "server", to: "reviewer-core", via: "tsconfig paths (tsconfig.json)", alias: "@devdigest/reviewer-core", target: "reviewer-core/src/index.ts" },
    { from: "server", to: "server/src/vendor/shared/index.ts", via: "tsconfig paths (tsconfig.json)", alias: "@devdigest/shared", target: "server/src/vendor/shared/index.ts", note: "vendored copy inside this package" },
    { from: "reviewer-core", to: "server", via: "tsconfig paths (tsconfig.json)", alias: "@devdigest/shared", target: "server/src/vendor/shared/index.ts" },
    { from: "mcp-server", to: "server", via: "tsconfig paths (tsconfig.json)", alias: "@devdigest/shared", target: "server/src/vendor/shared/index.ts" },
    { from: "client", to: "client/src/vendor/shared/index.ts", via: "tsconfig paths (tsconfig.json)", alias: "@devdigest/shared", target: "client/src/vendor/shared/index.ts", note: "vendored copy inside this package" },
  ],
  warnings: [],
};

// Raw hits only — what the commands printed, not what they mean.
const GREP_OUTPUT = `Raw output of the checks you ran for the referencedInSource:false entries:

$ grep -rn "autoload" server/src server/test .github scripts
server/src/modules/index.ts:22: * than via filesystem autoload so the same code path works under tsx, the

$ grep -rnE "['\\"](testcontainers|@testcontainers/postgresql)['\\"]" server/src server/test
server/test/helpers/pg.ts:1:import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

$ jq .dependencies server/node_modules/@testcontainers/postgresql/package.json
{ "testcontainers": "^10.28.0" }

$ grep -rn "postcss" client/src client/*.config.* client/package.json
client/postcss.config.mjs:4:    "@tailwindcss/postcss": {},
client/package.json:30:    "@tailwindcss/postcss": "^4.0.0",
client/package.json:31:    "postcss": "^8.4.49",

$ jq .dependencies client/node_modules/@tailwindcss/postcss/package.json
{ "@alloc/quick-lru": "^5.2.0", "@tailwindcss/node": "4.3.0", "@tailwindcss/oxide": "4.3.0", "postcss": "^8.5.10", "tailwindcss": "4.3.0" }

$ grep -rn "npm ci\\|pnpm install" .github/workflows/reviewer-core.yml
.github/workflows/reviewer-core.yml:45:      - run: npm ci`;

const DATA = `The collector has already run and the checks are done — the results are below. You have no tools in this session: do not try to run commands or write files. Produce the report as your reply, in the format the report would have on disk.

collect-deps.mjs output (trimmed):
\`\`\`json
${JSON.stringify(COLLECTED, null, 1)}
\`\`\`

${GREP_OUTPUT}

No previous docs/reference/dependencies-report.md exists.`;

export const cases: SkillCase[] = [
  {
    name: "full report follows the template: summary, map, inventory, findings, P0–P3, advice",
    kind: "quality",
    prompt: `Run the dependency check on the repo and give me the full report.\n\n${DATA}`,
    grounding: ["```mermaid", "P0", "P1"],
    practices: [
      "the report opens with a per-package summary table that includes, for each package, the lockfile manager vs the installer, the node_modules size, and vulnerability counts split into prod-reachable vs dev-only",
      "the report contains a Mermaid flowchart of the packages in which the cross-package tsconfig path aliases (e.g. @devdigest/reviewer-core, @devdigest/shared) are drawn as edges between packages, and vendored copies are distinguished from real cross-package links",
      "the report has per-package dependency tables listing kind (prod/dev), installed version, own size and size with transitive dependencies, and notes once that transitive sizes overlap and don't sum to the node_modules total",
      "findings are prioritised into explicit P0, P1, P2 and P3 levels, and each action row names the package path, the dependency, evidence (advisory ID/URL, versions, or file:line) and a concrete next-step command",
      "the report includes an Advice section and a 'Changes since last run' section stating that this is the first run (other sections such as Method may follow them)",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "prioritises by reach: prod advisories outrank dev-only and tooling criticals, repeated advisories become one action",
    kind: "quality",
    prompt: `We have a bunch of critical advisories showing up in npm audit. What do we fix first?\n\n${DATA}`,
    grounding: ["simple-git", "fastify", "vitest"],
    practices: [
      "the simple-git critical advisory in server (path .>simple-git, a prod dependency of a deployed package) is ranked P0",
      "the fastify high advisory in server (path .>fastify, prod; fix 5.12.5 is within the declared ^ range) is ranked P0 or P1 and is placed above every vitest/tinypool advisory, even though those are labelled critical",
      "the vitest/tinypool critical advisories are NOT ranked P0, and the answer explains this is because their audit paths start at vitest, which is a dev dependency, so they never ship to users",
      "the vitest advisories that repeat across server, client, reviewer-core, mcp-server and evals are consolidated into a single cross-package upgrade action rather than listed as separate findings per package",
      "the critical proxy-addr advisory in evals (path through @anthropic-ai/claude-agent-sdk, which is declared under dependencies) is NOT ranked P0, and the answer explains that evals is tooling that is never deployed, so its dependencies don't reach users",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
  {
    name: "verifies heuristics and drift instead of trusting raw flags; reports only, changes nothing",
    kind: "quality",
    prompt: `Find unused or messy dependencies and clean them up — remove whatever is unused and fix any version problems.\n\n${DATA}`,
    practices: [
      "@fastify/autoload in server is reported as confirmed unused, citing the server/src/modules/index.ts:22 grep hit as evidence that modules are not loaded via autoload",
      "testcontainers in server and postcss in client are NOT presented as plain unused dependencies: the answer explains they are already pulled in by @testcontainers/postgresql and @tailwindcss/postcss respectively (redundant direct entries at most, low priority)",
      "the zod major-version drift (mcp-server on 4.1.12 while server, client and reviewer-core are on 3.25.76) is flagged as a finding, and the identical typescript/vitest versions installed separately in each package are NOT flagged as duplication",
      "reviewer-core is flagged for lockfile/installer drift — it has a package-lock.json (npm) but its node_modules has a .pnpm directory (installed with pnpm), while CI runs npm ci — with a concrete fix",
      "the answer does not claim to have removed, installed, or upgraded anything; removals and upgrades are presented as next-step commands for the user to run, consistent with a report-only skill",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
];
