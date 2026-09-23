/**
 * DevDigest web e2e runner — Vercel agent-browser, deterministic, no LLM.
 *
 * agent-browser is a CDP browser-automation CLI (not a test framework), so we
 * define a thin convention: each flow is a `specs/*.flow.json` file listing
 * agent-browser commands. Commands share one browser session (the daemon keeps
 * the page between invocations). A command that exits non-zero — including a
 * `wait --text` / `wait --url` whose condition never holds — fails the step and
 * the flow. A flow step may also be `{ "use": "<fixture>" }`, which splices in
 * the steps from `specs/fixtures/<fixture>.json` — used to share a common step
 * sequence (e.g. "navigate to PR #482's detail route") across specs instead of
 * duplicating it verbatim.
 *
 * Malformed flow/fixture JSON fails just that one flow (logged clearly) — it
 * never aborts the whole run before the summary prints.
 *
 * Env:
 *   E2E_BASE_URL       web app origin (default http://localhost:3000)
 *   AGENT_BROWSER_BIN  binary name/path (default "agent-browser")
 *   E2E_STEP_TIMEOUT   per-command timeout in ms (default 60000)
 *
 * Specs target read-only seeded data, so nothing here triggers an LLM call or
 * needs an API key. Run order is the lexical order of the spec filenames.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isUseStep,
  resolveArgs,
  summarize,
  validateFixture,
  validateFlow,
  type FlowStep,
  type FlowResult,
  type ResolvedFlow,
  type Step,
  type StepResult,
} from "./lib/assert.js";

const exec = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(HERE, "specs");
const FIXTURES_DIR = join(SPECS_DIR, "fixtures");
const RESULTS_DIR = join(HERE, "test-results");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const BIN = process.env.AGENT_BROWSER_BIN ?? "agent-browser";
const STEP_TIMEOUT = Number(process.env.E2E_STEP_TIMEOUT ?? 60_000);

/** Run one agent-browser command; resolve with its stdout, reject on non-zero exit. */
async function ab(args: string[]): Promise<string> {
  const { stdout } = await exec(BIN, args, {
    cwd: HERE,
    timeout: STEP_TIMEOUT,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout ?? "";
}

/** Load and validate every `specs/fixtures/*.json` file into a name → steps map. */
function loadFixtures(): Map<string, Step[]> {
  const fixtures = new Map<string, Step[]>();
  let files: string[];
  try {
    files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return fixtures; // no fixtures directory yet — fine, `use` refs just won't resolve
  }
  for (const file of files) {
    const name = file.replace(/\.json$/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
    } catch (e) {
      console.error(`invalid fixture file fixtures/${file}: ${(e as Error).message}`);
      continue;
    }
    const result = validateFixture(parsed, `fixtures/${file}`);
    if (typeof result === "string") {
      console.error(result);
      continue;
    }
    fixtures.set(name, result);
  }
  return fixtures;
}

/** Expand any `{ use }` entries against the loaded fixtures. Returns an error string on an unknown fixture name. */
function expandSteps(steps: FlowStep[], fixtures: Map<string, Step[]>, file: string): Step[] | string {
  const out: Step[] = [];
  for (const step of steps) {
    if (isUseStep(step)) {
      const fixture = fixtures.get(step.use);
      if (!fixture) {
        return `invalid flow file ${file}: unknown fixture "${step.use}" (expected specs/fixtures/${step.use}.json)`;
      }
      out.push(...fixture);
    } else {
      out.push(step);
    }
  }
  return out;
}

/**
 * Load every `specs/*.flow.json`, validating shape and expanding `use` refs.
 * A malformed flow file (or one that references an unknown fixture) is logged
 * and skipped — it does not abort loading the rest, or the run.
 */
function loadFlows(): { file: string; flow: ResolvedFlow }[] {
  const fixtures = loadFixtures();
  const files = readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith(".flow.json"))
    .sort();

  const flows: { file: string; flow: ResolvedFlow }[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(SPECS_DIR, file), "utf8"));
    } catch (e) {
      console.error(`invalid flow file ${file}: ${(e as Error).message}`);
      continue;
    }

    const validated = validateFlow(parsed, file);
    if (typeof validated === "string") {
      console.error(validated);
      continue;
    }

    const steps = expandSteps(validated.steps, fixtures, file);
    if (typeof steps === "string") {
      console.error(steps);
      continue;
    }

    flows.push({ file, flow: { name: validated.name, description: validated.description, steps } });
  }
  return flows;
}

async function runFlow(file: string, flow: ResolvedFlow): Promise<FlowResult> {
  const id = file.replace(/\.flow\.json$/, "");
  console.log(`\n▶ ${flow.name}  (${file})`);
  const steps: StepResult[] = [];

  for (const step of flow.steps) {
    const label = step.label ?? step.cmd.join(" ");
    try {
      const args = resolveArgs(step.cmd, BASE);
      await ab(args);
      steps.push({ label, ok: true });
      console.log(`   ✓ ${label}`);
    } catch (e) {
      const msg = (e as Error).message.split("\n")[0];
      steps.push({ label, ok: false, detail: msg });
      console.log(`   ✗ ${label} — ${msg}`);
      // Best-effort failure screenshot for the artifact upload.
      mkdirSync(RESULTS_DIR, { recursive: true });
      await ab(["screenshot", join(RESULTS_DIR, `${id}-fail.png`)]).catch(() => {});
      break;
    }
  }

  const ok = steps.every((s) => s.ok);
  return { name: flow.name, ok, steps };
}

async function main(): Promise<void> {
  console.log(`DevDigest e2e — base=${BASE} bin=${BIN}`);
  const flows = loadFlows();
  if (flows.length === 0) {
    console.error(`No valid specs found in ${SPECS_DIR}`);
    process.exit(1);
  }

  const results: FlowResult[] = [];
  try {
    for (const { file, flow } of flows) {
      results.push(await runFlow(file, flow));
    }
  } finally {
    // Tear down the shared browser session regardless of outcome.
    await ab(["close"]).catch(() => {});
  }

  console.log(`\n${summarize(results)}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => {
  console.error(`e2e runner crashed: ${(e as Error).message}`);
  process.exit(1);
});
