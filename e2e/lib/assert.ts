/**
 * Tiny helpers for the e2e runner. Assertions are intentionally minimal: most
 * of the "assert" work is done by agent-browser's own `wait --text` / `wait --url`
 * commands, which exit non-zero when the condition isn't met within the timeout.
 * These helpers cover: the `{BASE}` substitution, flow/fixture shape validation
 * (so a malformed spec file fails just that flow instead of crashing the whole
 * run), and result bookkeeping.
 */

/** A single agent-browser invocation within a flow. */
export interface Step {
  /** agent-browser argv, e.g. ["wait", "--text", "#482"]. `{BASE}` is substituted. */
  cmd: string[];
  /** Human label for logs (defaults to the joined cmd). */
  label?: string;
}

/**
 * A reference to a reusable step sequence defined in `specs/fixtures/<use>.json`,
 * spliced in place of this entry before the flow runs. Keeps common prefixes
 * (e.g. "navigate to PR #482's detail route") defined once instead of repeated
 * verbatim across every spec that needs them.
 */
export interface UseStep {
  use: string;
}

/** An entry in a flow file's `steps` array, before fixture expansion. */
export type FlowStep = Step | UseStep;

export function isUseStep(step: FlowStep): step is UseStep {
  return typeof (step as { use?: unknown }).use === "string";
}

/** A flow as parsed from `specs/*.flow.json`, before `use` refs are expanded. */
export interface Flow {
  name: string;
  description?: string;
  steps: FlowStep[];
}

/** A flow ready to run: every `use` reference has been expanded to concrete steps. */
export interface ResolvedFlow {
  name: string;
  description?: string;
  steps: Step[];
}

export interface StepResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface FlowResult {
  name: string;
  ok: boolean;
  steps: StepResult[];
}

/** Substitute `{BASE}` (and trim a trailing slash on BASE) in every arg. */
export function resolveArgs(cmd: string[], base: string): string[] {
  const b = base.replace(/\/+$/, "");
  return cmd.map((a) => a.replaceAll("{BASE}", b));
}

function isCmdArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((c) => typeof c === "string");
}

/** Shape-check a single flow-file step entry: either a `{ use }` ref or a concrete `{ cmd, label? }`. */
function isValidFlowStepShape(s: unknown): s is FlowStep {
  if (typeof s !== "object" || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (typeof obj.use === "string" && obj.use.length > 0) return true;
  return isCmdArray(obj.cmd) && (obj.label === undefined || typeof obj.label === "string");
}

/**
 * Validate the shape of a parsed `*.flow.json` file. Returns the typed `Flow`
 * on success, or a human-readable error string on failure. Callers should log
 * the error and skip just this flow rather than throw — one malformed spec
 * file must not abort the whole suite before `summarize()` runs.
 */
export function validateFlow(data: unknown, file: string): Flow | string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return `invalid flow file ${file}: expected a JSON object, got ${Array.isArray(data) ? "array" : typeof data}`;
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    return `invalid flow file ${file}: missing or non-string "name"`;
  }
  if (obj.description !== undefined && typeof obj.description !== "string") {
    return `invalid flow file ${file}: "description" must be a string when present`;
  }
  if (!Array.isArray(obj.steps)) {
    return `invalid flow file ${file}: "steps" must be an array`;
  }
  for (let i = 0; i < obj.steps.length; i++) {
    if (!isValidFlowStepShape(obj.steps[i])) {
      return `invalid flow file ${file}: step ${i} is malformed (needs a non-empty string "use", or a "cmd" array of strings plus an optional string "label")`;
    }
  }
  return {
    name: obj.name,
    description: obj.description as string | undefined,
    steps: obj.steps as FlowStep[],
  };
}

/**
 * Validate a fixture file (`specs/fixtures/<name>.json`): a flat JSON array of
 * concrete steps. Fixtures may not reference other fixtures (no nested `use`)
 * to keep expansion a single, non-recursive pass.
 */
export function validateFixture(data: unknown, file: string): Step[] | string {
  if (!Array.isArray(data)) {
    return `invalid fixture file ${file}: expected a JSON array of steps`;
  }
  for (let i = 0; i < data.length; i++) {
    const s = data[i];
    const obj = typeof s === "object" && s !== null ? (s as Record<string, unknown>) : null;
    if (!obj || !isCmdArray(obj.cmd) || (obj.label !== undefined && typeof obj.label !== "string")) {
      return `invalid fixture file ${file}: step ${i} is malformed (needs a "cmd" array of strings plus an optional string "label")`;
    }
  }
  return data as Step[];
}

export function summarize(results: FlowResult[]): string {
  const lines: string[] = [];
  for (const f of results) {
    lines.push(`${f.ok ? "PASS" : "FAIL"}  ${f.name}`);
    for (const s of f.steps) {
      if (!s.ok) lines.push(`        ✗ ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
    }
  }
  const passed = results.filter((r) => r.ok).length;
  lines.push("");
  lines.push(`${passed}/${results.length} flows passed`);
  return lines.join("\n");
}
