# dev-digest — agent map

## Stack
No monorepo tooling. Six independent packages, each with its own
`package.json`/lockfile, linked only via TypeScript path aliases: `server/`
(`@devdigest/api`), `client/` (`@devdigest/web`), `reviewer-core/`
(`@devdigest/reviewer-core`), `e2e/` (`@devdigest/e2e`), `mcp-server/`
(`@devdigest/mcp-server`), and `server/src/vendor/shared` (`@devdigest/shared`,
also vendored into `client/`). Only Postgres (pgvector) runs in Docker — API
and web run on the host.

## Commands
- `./scripts/dev.sh` — starts Postgres, scaffolds `.env`s, installs deps,
  migrates + seeds, launches API (:3001) + web (:3000). Flags: `--no-seed` ·
  `--no-client` · `--db-only` · `--help`.
- `./scripts/e2e.sh` (or `cd e2e && npm run e2e:hermetic`) — isolated e2e stack
  on alternate ports; safe to run alongside `dev.sh`.
- `docker compose up -d` / `down` — Postgres only; `down -v` drops the data volume.
- MCP server: registered project-wide via root `/.mcp.json` (Claude Code picks it up automatically, asking for one-time approval per checkout; not started by `dev.sh` — the DevDigest API must be running separately) — see `mcp-server/README.md`.

## Map
- `server/`, `client/`, `reviewer-core/`, `e2e/`, `mcp-server/` — see each package's own `AGENTS.md`
- `specs/` — Spec-Driven Development specs (`SPEC-<YYYY-MM-DD>-<slug>.md`, in English) for features spanning several packages; single-package specs go in `<package>/specs/`. Written by the `spec-creator` agent; once approved, a spec is the input for `implementation-planner`.
- `docs/agent-prompts/` — reference reviewer system prompts + model-choice notes
- `TESTING.md` — cross-package testing/CI strategy (one suite per package, own workflow + path filter)
- `evals/` — evals for the Claude Code harness itself (skills, subagents, `CLAUDE.md`/`AGENTS.md` routing) — see `evals/README.md`; which one to run after a change: **Evals** below
- `docker-compose.yml` — the Postgres/pgvector service definition
- `.claude/skills/` + `skills-lock.json` — installed Claude Code skills (managed by skill tooling, not hand-edited)

## Conventions (non-default)
- Cross-package sharing is via tsconfig path aliases (e.g. `@devdigest/reviewer-core` → `../reviewer-core/src`), never a published/npm dependency between these packages.
- `main` is the **course starter state** — minimal and working end-to-end. Lesson/feature work happens in forks, not on `main` (see git history: `revert: restore main to the starter state, homework belongs in forks`).
- Each package's test suite runs only when that package (or a package it depends on at type-check time) changes — see `TESTING.md` for the suite-to-workflow map.
- When the user asks to record, remember or "зафіксувати" a finding/gotcha, invoke the `engineering-insights` skill first — never hand-edit a package's `Insights.md`. The skill enforces evidence-only, de-duplicated, append-only entries; every later session reads `Insights.md` as fact.

## Evals — which one to run after a change
Run from `evals/` (`cd evals && pnpm install` once). Model-backed suites cost real tokens, so run
only the row that matches what you changed; `pnpm eval:quality` is free (no model).

| You changed | Run |
|---|---|
| A skill (`.claude/skills/<name>/SKILL.md` or its `references/`) | `pnpm vitest run skills/<name>` |
| A subagent (`.claude/agents/<name>.md`) | `pnpm vitest run agents/<name>` |
| Root `CLAUDE.md`, any package `AGENTS.md`, or a skill/subagent `description` (activation and dispatch) | `pnpm eval:workflow` |
| The structure or frontmatter of any skill/agent | `pnpm eval:quality` |
| An edit you want to **measure** (better or worse?) | `pnpm eval:repeat <path> -n 5 --label baseline` **before** editing, `--label candidate` after, then `pnpm eval:delta baseline candidate` |
| A new skill/agent — is it worth its tokens? | `pnpm eval:scaffold <name>` to create cases, then `pnpm eval:benchmark skills/<name>` (with vs without the artifact) |
| The model, Claude Code version, or the `evals/` engine | `pnpm eval` (everything) |

CI (`.github/workflows/evals.yml`) picks the suites a PR touches on its own
(`evals/scripts/ci-detect.mjs`); a changed skill/agent that has no evals yet is logged as
`SKIP … (no evals)`, not failed. Fork PRs get only the free static gate: the model-backed jobs need
the `OPENROUTER_API_KEY` secret, which GitHub does not pass to forks.

## Gotchas
- The server does **not** apply DB migrations on boot — `relation does not exist` errors mean run `cd server && pnpm db:migrate`.
- `docker compose down -v` deletes the `devdigest_pgdata` volume and everything in it — never run it to "just restart"; use `e2e/`'s isolated stack instead of touching your dev DB for e2e runs.
- Port 5432 conflicts with another local Postgres are common — either stop it or change the host port in `docker-compose.yml`.

## Do not touch
- `docker-compose.yml` volume name (`devdigest_pgdata`) — renaming orphans existing data.
- `skills-lock.json` — generated/verified by the skills tooling; edit through that tooling, not by hand.
- Each package's `CLAUDE.md` — a symlink to that package's `AGENTS.md`, not a real file. Claude Code only auto-loads a file literally named `CLAUDE.md`; edit `AGENTS.md` (the tracked source of truth), and don't replace the symlink with a real copy.

## Docs
- Quick start & architecture overview: [README.md](README.md)
- Testing & CI strategy: [TESTING.md](TESTING.md)
- Harness evals (skills / agents / workflow): [evals/README.md](evals/README.md)
- Agent/reviewer prompt reference: `docs/agent-prompts/`
- Per-package depth (stack, map, gotchas, do-not-touch, Docs/Specs/Insights): each package's own `AGENTS.md`
