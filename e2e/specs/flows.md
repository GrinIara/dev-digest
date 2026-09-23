# e2e — Spec: what each flow verifies

Companion to the `*.flow.json` files in this folder — one paragraph per flow. All assertions are `wait --text`/`wait --url` steps (see `../docs/architecture.md`); if you change UI copy or a route these flows check, update the flow JSON, and this doc, together.

## Shared fixtures

`02`, `04`, and `05` all start by navigating from the PR list into PR #482's
detail route. That five-step prefix (open root → land on `/pulls` → click the
seeded PR row → land on `/pulls/482` → wait for detail data to settle) is
defined once in `fixtures/gotoPr482.json` and pulled into each flow via a
`{ "use": "gotoPr482" }` step — see `../docs/architecture.md` for how `use`
resolution works.

## `01-app-boot.flow.json`
Whole-stack smoke test, order-independent. Opens `{BASE}/`, waits for the root route to redirect to `/pulls` (proves the API returned at least one repo), then waits for the "Pull Requests" heading to render.

## `02-repo-pulls-detail.flow.json`
Uses `gotoPr482` to open PR #482 from the list, then verifies the detail route loads with the PR title. **Assumes the seeded demo repo `acme/payments-api` is the only repo in the DB** (the home redirect lands on "the first" repo) — always run via the hermetic stack, never against a dev DB with other imported repos.

## `03-agents.flow.json`
Loads `/agents` and confirms the seeded "Security Reviewer" agent card renders.

## `04-pr-findings.flow.json`
Uses `gotoPr482`, then opens the "Agent runs" tab and verifies the newest review run's accordion (open by default) shows its verdict ("request changes"), its finding count ("2 findings"), and the specific seeded finding "Hardcoded Stripe secret key in commit". Same single-repo assumption as `02`.

## `05-pr-diff.flow.json`
Uses `gotoPr482`, then opens the "Files changed" tab and verifies the diff viewer renders the seeded changed file `src/config.ts`. Same single-repo assumption as `02`.

## `06-onboarding.flow.json`
Loads `/onboarding` and verifies the add-repository form renders (heading + the "Repository URL" field) — no submission is performed, so this flow never mutates state.

## `07-settings.flow.json`
Loads `/settings/api-keys` then `/settings/models` and verifies each section's title renders ("API Keys", then "Feature Models").

## Convention

Locators are deterministic only (`--url`, `--text`, `find role|text|label`) — never the AI `chat` command — so runs stay stable and key-free. Flows target read-only seeded data; none of them mutate state (`06` renders a form but never submits it).
