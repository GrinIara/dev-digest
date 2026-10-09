/**
 * CI change detector for the harness evals (used by .github/workflows/evals.yml).
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *     + any other eval file that imports from a changed evals/<tier>/<name>/ folder
 *       (architecture-reviewer-lite reuses architecture-reviewer's cases)
 *   CLAUDE.md / any AGENTS.md (package CLAUDE.md files are symlinks to it) / .claude settings or
 *   READMEs / any agent definition / a skill the workflow cases name / evals/workflow/**
 *                                                           → run the workflow tier
 *   evals engine (src/, package.json, lockfile, vitest config, proxy/, this script, evals.yml)
 *                                                           → run EVERYTHING that has evals
 *
 * $EVAL_TARGETS overrides detection (manual workflow_dispatch): auto (default) | all | skills |
 * agents | workflow.
 *
 * A changed artifact with NO written evals is NOT a failure: it is logged as "SKIP <name> (no
 * evals)" (plus a ::notice:: annotation) and simply not run.
 *
 * Emits GitHub Actions step outputs to $GITHUB_OUTPUT (stdout when run locally):
 *   content_paths  space-separated vitest filters for the skill + agent tiers ("" = nothing to run)
 *   run_workflow   "true" | "false"
 * Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = process.env.EVAL_TARGETS || "auto";

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const log = (s) => console.error(s);

/** Names of the folders under evals/<tier>/ that contain at least one *.eval.ts. */
function evalNames(tier) {
  const root = join(EVALS_DIR, tier);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && hasEvals(tier, d.name))
    .map((d) => d.name)
    .sort();
}

function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

const workflowHasEvals = existsSync(join(EVALS_DIR, "workflow"))
  && readdirSync(join(EVALS_DIR, "workflow")).some((f) => f.endsWith(".eval.ts"));

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m && m[1] !== "README") names.add(m[1]);
  }
  return names;
}

/** Eval folders in `tier` whose *.eval.ts imports from evals/<srcTier>/<name>/ (shared cases). */
function importers(tier, srcTier, name) {
  return evalNames(tier).filter((n) =>
    readdirSync(join(EVALS_DIR, tier, n))
      .filter((f) => f.endsWith(".eval.ts"))
      .some((f) => {
        const src = readFileSync(join(EVALS_DIR, tier, n, f), "utf8");
        return tier === srcTier
          ? src.includes(`../${name}/`)
          : src.includes(`../../${srcTier}/${name}/`);
      }),
  );
}

const ENGINE = [
  /^evals\/src\//,
  /^evals\/(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts)$/,
  /^evals\/proxy\//,
  /^evals\/scripts\/(ci-detect\.mjs|litellm-proxy\.sh)$/,
  /^\.github\/workflows\/evals\.yml$/,
];
const engineChanged = changed.some((f) => ENGINE.some((re) => re.test(f)));

let skillNames;
let agentNames;
let runWorkflow;

if (TARGETS !== "auto" || engineChanged) {
  const all = TARGETS === "all" || (TARGETS === "auto" && engineChanged);
  skillNames = new Set(all || TARGETS === "skills" ? evalNames("skills") : []);
  agentNames = new Set(all || TARGETS === "agents" ? evalNames("agents") : []);
  runWorkflow = all || TARGETS === "workflow";
  log(TARGETS !== "auto" ? `targets override: ${TARGETS}` : "evals engine changed → running every suite");
} else {
  skillNames = touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
  agentNames = touched(/^\.claude\/agents\/([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//);

  // Shared cases: a changed evals/<tier>/<name>/ folder (not the .claude artifact itself) also
  // re-runs every eval that imports it.
  for (const tier of ["skills", "agents"]) {
    const names = tier === "skills" ? skillNames : agentNames;
    for (const n of touched(/$^/, new RegExp(`^evals\\/${tier}\\/([^/]+)\\/`))) {
      importers(tier, tier, n).forEach((m) => names.add(m));
    }
  }

  // Workflow cases that name a skill (activation cases) must re-run when that skill changes.
  const workflowCases = existsSync(join(EVALS_DIR, "workflow"))
    ? readdirSync(join(EVALS_DIR, "workflow"))
        .filter((f) => f.endsWith(".cases.ts"))
        .map((f) => readFileSync(join(EVALS_DIR, "workflow", f), "utf8"))
        .join("\n")
    : "";
  const skillInWorkflow = [...skillNames].some((n) => workflowCases.includes(`"${n}"`));

  // The workflow tier measures the LIVE harness, so anything that changes it re-triggers it.
  runWorkflow =
    skillInWorkflow ||
    changed.some(
      (f) =>
        f === "CLAUDE.md" ||
        f === ".claude/CLAUDE.md" ||
        /(^|\/)AGENTS\.md$/.test(f) ||
        /^\.claude\/settings(\.local)?\.json$/.test(f) ||
        /^\.claude\/(agents|skills)\/README\.md$/.test(f) ||
        /^\.claude\/agents\/.+\.md$/.test(f) ||
        /^evals\/workflow\//.test(f),
    );
}

const sorted = (s) => [...s].sort();
const skills = sorted(skillNames).filter((n) => hasEvals("skills", n));
const skippedSkills = sorted(skillNames).filter((n) => !hasEvals("skills", n));
const agents = sorted(agentNames).filter((n) => hasEvals("agents", n));
const skippedAgents = sorted(agentNames).filter((n) => !hasEvals("agents", n));
const skippedWorkflow = runWorkflow && !workflowHasEvals;
if (skippedWorkflow) runWorkflow = false;

const contentPaths = [...skills.map((n) => `skills/${n}/`), ...agents.map((n) => `agents/${n}/`)];

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));
write("content_paths", contentPaths.join(" "));
write("run_workflow", String(runWorkflow));

// Human-readable summary in the step log.
const notice = (msg) => {
  log(msg);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=evals skipped::${msg}`);
};
log("── eval change detection ──");
log(`changed files : ${changed.length}`);
log(`skills → run  : ${skills.join(", ") || "(none)"}`);
log(`agents → run  : ${agents.join(", ") || "(none)"}`);
log(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
for (const n of skippedSkills) notice(`SKIP skill ${n} (no evals in evals/skills/${n}/)`);
for (const n of skippedAgents) notice(`SKIP agent ${n} (no evals in evals/agents/${n}/)`);
if (skippedWorkflow) notice("SKIP workflow tier (no *.eval.ts in evals/workflow/)");
