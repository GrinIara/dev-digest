# dev-digest — agent map

## Stack
No monorepo tooling. Five independent packages, each with its own
`package.json`/lockfile, linked only via TypeScript path aliases: `server/`
(`@devdigest/api`), `client/` (`@devdigest/web`), `reviewer-core/`
(`@devdigest/reviewer-core`), `e2e/` (`@devdigest/e2e`), and
`server/src/vendor/shared` (`@devdigest/shared`, also vendored into `client/`).
Only Postgres (pgvector) runs in Docker — API and web run on the host.

## Commands
- `./scripts/dev.sh` — starts Postgres, scaffolds `.env`s, installs deps,
  migrates + seeds, launches API (:3001) + web (:3000). Flags: `--no-seed` ·
  `--no-client` · `--db-only` · `--help`.
- `./scripts/e2e.sh` (or `cd e2e && npm run e2e:hermetic`) — isolated e2e stack
  on alternate ports; safe to run alongside `dev.sh`.
- `docker compose up -d` / `down` — Postgres only; `down -v` drops the data volume.

## Map
- `server/`, `client/`, `reviewer-core/`, `e2e/` — see each package's own `CLAUDE.md`
- `docs/agent-prompts/` — reference reviewer system prompts + model-choice notes
- `TESTING.md` — cross-package testing/CI strategy (one suite per package, own workflow + path filter)
- `docker-compose.yml` — the Postgres/pgvector service definition
- `.claude/skills/` + `skills-lock.json` — installed Claude Code skills (managed by skill tooling, not hand-edited)

## Conventions (non-default)
- Cross-package sharing is via tsconfig path aliases (e.g. `@devdigest/reviewer-core` → `../reviewer-core/src`), never a published/npm dependency between these packages.
- `main` is the **course starter state** — minimal and working end-to-end. Lesson/feature work happens in forks, not on `main` (see git history: `revert: restore main to the starter state, homework belongs in forks`).
- Each package's test suite runs only when that package (or a package it depends on at type-check time) changes — see `TESTING.md` for the suite-to-workflow map.

## Gotchas
- The server does **not** apply DB migrations on boot — `relation does not exist` errors mean run `cd server && pnpm db:migrate`.
- `docker compose down -v` deletes the `devdigest_pgdata` volume and everything in it — never run it to "just restart"; use `e2e/`'s isolated stack instead of touching your dev DB for e2e runs.
- Port 5432 conflicts with another local Postgres are common — either stop it or change the host port in `docker-compose.yml`.

## Do not touch
- `docker-compose.yml` volume name (`devdigest_pgdata`) — renaming orphans existing data.
- `skills-lock.json` — generated/verified by the skills tooling; edit through that tooling, not by hand.

## Docs
- Quick start & architecture overview: [README.md](README.md)
- Testing & CI strategy: [TESTING.md](TESTING.md)
- Agent/reviewer prompt reference: `docs/agent-prompts/`
- Per-package depth (stack, map, gotchas, do-not-touch, Docs/Specs/Insights): each package's own `CLAUDE.md`
