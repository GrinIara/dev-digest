# e2e — Architecture: the flow runner

## Discovery and ordering

`run.ts`'s `loadFlows` reads every `*.flow.json` under `specs/` and sorts them — **run order is the lexical order of the filenames**, which is exactly why flows are named `NN-name.flow.json`. The number isn't decorative; it *is* the run order.

## Flow/fixture validation

Each parsed flow file is passed through `validateFlow` (`lib/assert.ts`) before it's used: it must be an object with a non-empty string `name` and a `steps` array, where every step is either `{ "use": "<fixture>" }` or a concrete `{ "cmd": [string, ...], "label"?: string }`. `loadFlows` also loads every `specs/fixtures/*.json` file up front (via `validateFixture`, same shape rules but no nested `use`) and expands each flow's `use` entries against them. **A malformed flow file, a malformed fixture file, or a flow referencing an unknown fixture is logged and that one flow is skipped — it does not throw, and does not abort loading or running the rest of the suite.** This is what keeps the documented "one flow's failure doesn't abort the suite" guarantee true even for a bad spec file, not just a failing step.

## Composing flows with `use`

`specs/02-*`, `specs/04-*`, and `specs/05-*` all start by navigating from the PR list into PR #482's detail route. That five-step prefix lives once in `specs/fixtures/gotoPr482.json`; each flow references it with a single `{ "use": "gotoPr482" }` step, which `loadFlows` splices in place before the flow runs. Add new shared prefixes the same way: a fixture is just a flat JSON array of concrete steps, no different from a flow's own `steps` array minus `name`/`description`.

## Executing a flow

For each (already-fixture-expanded) `step` in a flow, `resolveArgs(step.cmd, BASE)` substitutes `{BASE}` into every argument (and strips a trailing slash from `BASE`) — this call, like the rest of the step's execution, happens inside the per-step `try`, so a step that somehow fails to resolve is caught and reported like any other step failure rather than crashing the run. The resolved `cmd` array is passed **verbatim** to the `agent-browser` CLI via `execFile` (default binary name `agent-browser`, overridable via `AGENT_BROWSER_BIN`), run from the `e2e/` directory with a per-step timeout and a 32MB max buffer. All steps across all flows run against **one shared browser session** — the browser is only closed once, in a `finally` block, after every flow has run.

## Assertions are just steps

There's no separate `expect()` call in this package. A `wait --text "..."` or `wait --url "..."` step **is** the assertion — it exits non-zero (and the step is recorded as failed) if the condition isn't met before the timeout.

## Failure handling

If a step fails (the CLI exits non-zero), the flow's remaining steps are skipped (the loop breaks) but the runner moves on to the next flow — one flow's failure doesn't abort the whole suite. A best-effort screenshot is then taken to `test-results/<flow-id>-fail.png` (git-ignored, uploaded as a CI artifact). The final summary prints PASS/FAIL per flow and an `N/M flows passed` line; the process exits non-zero unless every flow passed.

## Hermetic mode vs. plain `npm test`

- `npm test` (`tsx run.ts`) runs the flows against whatever stack is already listening on `E2E_BASE_URL` (default `http://localhost:3000`) — it assumes `scripts/dev.sh` (or equivalent) already started Postgres/API/web and seeded the DB.
- `npm run e2e:hermetic` (`../scripts/e2e.sh`) stands up a **fully isolated, ephemeral stack**: a throwaway `pgvector/pgvector:pg16` container with no named volume (empty every run), migrated + seeded, then the API and web dev servers, all on **alternate ports** (Postgres `5433`, API `3101`, web `3100` — vs. the normal dev stack's `5432`/`3001`/`3000`) so it can run alongside a dev stack that's already up. Everything is torn down in a `trap cleanup EXIT INT TERM`.
- **Why this matters beyond convenience**: flows `02`, `04`, and `05` all assume the seeded demo repo (`acme/payments-api`, PR #482) is the *only* repo in the database, because the app's `/` route redirects to the "first" repo. A normal dev DB with other imported repos breaks that assumption and makes those flows land on the wrong repo. The hermetic script's freshly-seeded, single-repo Postgres is what guarantees the assumption holds — this is why it's the recommended way to run e2e, not just a port-conflict workaround.
- Note: CI does not use `scripts/e2e.sh` — the GitHub Actions workflow brings up its own stack and calls `npm test` directly.

## `lib/assert.ts`

The only helper file in `lib/`. It defines the `Step`/`UseStep`/`FlowStep`/`Flow`/`ResolvedFlow`/`StepResult`/`FlowResult` shapes, `resolveArgs` (the `{BASE}` substitution), `validateFlow`/`validateFixture` (shape checks used by `loadFlows`), and `summarize` (the PASS/FAIL report builder). Covered by `lib/assert.test.ts` (`npm run test:unit`).
