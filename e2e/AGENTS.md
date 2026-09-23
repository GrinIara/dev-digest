# e2e — agent map

## Session protocol
Before working in this module, read `Insights.md`. When a session surfaces a substantial, non-obvious finding, use the `engineering-insights` skill to append it (skip if nothing new).

## Stack
TypeScript 5.7 · tsx runtime · Vercel **agent-browser** CLI (Rust + CDP). No
Playwright, no LLM, no API key.

## Commands
- `npm run e2e:hermetic` (`../scripts/e2e.sh`) — isolated stack on alt ports, recommended
- `npm test` (`tsx run.ts`) — runs against your **own** running dev stack (see Gotchas)
- `npm run typecheck` / `npm run lint`
- one-time: `npm i -g agent-browser && agent-browser install`

## Map
- `specs/NN-name.flow.json` — one JSON step-list per flow, run in order
- `run.ts` — executes all flows against one shared browser session
- `lib/` — runner helpers
- `agent-browser.json` — CLI config

## Conventions (non-default)
- Each flow step's `cmd` array is passed verbatim to `agent-browser`; `wait --text` / `wait --url` steps **are** the assertions (they exit non-zero on timeout) — there's no separate `expect()`.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`) — never the AI `chat` command, so runs stay stable and key-free.
- Flows target read-only seeded data (`acme/payments-api`, PR #482) — never add a flow that mutates state.

## Naming conventions
- Flow files: `NN-name.flow.json`, zero-padded two-digit prefix — the number IS the run order (flows run in the lexical order `readdirSync(...).sort()` returns), not just a label.

## Gotchas
- Flows `02`/`04`/`05` assume the seeded demo repo is the **only** repo (the home route redirects to the "first" one) — a dev DB with other imported repos makes them land on the wrong repo and fail. Use the hermetic runner instead of `npm test` against your normal dev DB.
- Hermetic stack runs on alternate ports (Postgres `5433`, API `3101`, web `3100`) specifically so it can run alongside your normal dev stack without conflict.
- Failure screenshots go to `test-results/` (git-ignored, uploaded as a CI artifact).

## Do not touch
- **Never** `docker compose down -v` to "reset" anything — it deletes the `devdigest_pgdata` volume along with every real repo/review you've imported. Use the hermetic runner's isolated, ephemeral Postgres instead.
- `specs/` numbering/order — flow `02` depends on the seeded repo being "first"; inserting specs before it can change which repo that is.
- `package-lock.json` — regenerate via `npm install`, never hand-edit.

## Read When
- Usage, flow anatomy & coverage table → [README.md](README.md)
- Touching the flow runner itself (`run.ts`/`lib/`) → `docs/architecture.md`
- Adding/changing a flow → `specs/flows.md` (alongside the `*.flow.json` it documents)
- Decisions & gotchas log → `Insights.md`
