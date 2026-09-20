# e2e — Spec: what each flow verifies

Companion to the `*.flow.json` files in this folder — one paragraph per flow. All assertions are `wait --text`/`wait --url` steps (see `../docs/architecture.md`); if you change UI copy or a route these flows check, update the flow JSON, and this doc, together.

## `01-app-boot.flow.json`
Whole-stack smoke test, order-independent. Opens `{BASE}/`, waits for the root route to redirect to `/pulls` (proves the API returned at least one repo), then waits for the "Pull Requests" heading to render.

## `02-repo-pulls-detail.flow.json`
From the PR list, clicks into the seeded PR #482 and verifies the nested detail route loads with the PR title. **Assumes the seeded demo repo `acme/payments-api` is the only repo in the DB** (the home redirect lands on "the first" repo) — always run via the hermetic stack, never against a dev DB with other imported repos.

## `03-agents.flow.json`
Loads `/agents` and confirms the seeded "Security Reviewer" agent card renders.

## `04-pr-findings.flow.json`
From PR #482, opens the "Agent runs" tab and verifies the newest review run's accordion (open by default) shows its verdict ("request changes"), its finding count ("2 findings"), and the specific seeded finding "Hardcoded Stripe secret key in commit". Same single-repo assumption as `02`.

## `05-pr-diff.flow.json`
From PR #482, opens the "Files changed" tab and verifies the diff viewer renders the seeded changed file `src/config.ts`. Same single-repo assumption as `02`.

## `06-onboarding.flow.json`
Loads `/onboarding` and verifies the add-repository form renders (heading + the "Repository URL" field) — no submission is performed, so this flow never mutates state.

## `07-settings.flow.json`
Loads `/settings/api-keys` then `/settings/models` and verifies each section's title renders ("API Keys", then "Feature Models").

## Convention

Locators are deterministic only (`--url`, `--text`, `find role|text|label`) — never the AI `chat` command — so runs stay stable and key-free. Flows target read-only seeded data; none of them mutate state (`06` renders a form but never submits it).
