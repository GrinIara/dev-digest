# server — agent map

## Session protocol
Before working in this module, read `Insights.md`. When a session surfaces a substantial, non-obvious finding, use the `engineering-insights` skill to append it (skip if nothing new).

## Stack
Node 22 · TypeScript 5.7 · Fastify 5 · Drizzle ORM 0.38 (Postgres + pgvector) ·
Zod 3 contracts via fastify-type-provider-zod · tsx runtime, no build step for `dev`.

## Commands
- `pnpm dev` — API on :3001
- `pnpm db:migrate` / `pnpm db:seed` — NOT run automatically on boot
- `pnpm test` — unit + integration; unit only: `--exclude '**/*.it.test.ts'`; integration only: `.it.test` filter
- `pnpm typecheck` / `pnpm build` / `pnpm lint`

## Map
- `src/modules/<name>/` — one Fastify plugin per domain (routes + service), registered in `src/modules/index.ts`
- `src/adapters/` — ports to the outside world (llm, github, git, astgrep, secrets, auth, tokenizer, embedder, codeindex, depgraph); swapped for `src/adapters/mocks.ts` in tests
- `src/platform/` — DI container, config, errors, prompt/grounding helpers, SSE, run tracing
- `src/db/` — Drizzle schema, migrations, migrate/seed scripts
- `src/vendor/shared` — `@devdigest/shared` Zod contracts, also imported by `client/` and `reviewer-core/`
- `src/prompts/` — system prompt templates

## Conventions (non-default)
- Routes declare Zod `params`/`body` schemas; invalid input 422s before the handler runs — never hand-parse `req.body`.
- All external calls go through the DI container (`platform/container.ts`); add a port + prod/mock pair, not a direct import.
- Modules are registered statically in `src/modules/index.ts` — new module = new import + `app.register` there.
- Secrets (API keys, `GITHUB_TOKEN`) are never in `.env`/DB — they flow through `SecretsProvider` → `~/.devdigest/secrets.json` (mode 0600); `LocalSecretsProvider` is the one read chokepoint.

## Naming conventions
- Drizzle schema: camelCase TS field, snake_case DB column, e.g. `workspaceId: uuid('workspace_id')`, `startLine: integer('start_line')` (`src/db/schema/reviews.ts`) — the column-name string is always the snake_case form.
- Module layout: `modules/<name>/routes.ts` + `service.ts` for simple domains; larger domains additionally split data access into `modules/<name>/repository/<aggregate>.repo.ts` files (e.g. `reviews/repository/{review,run,pull}.repo.ts`) behind a thin `repository.ts` facade.
- Data-access files end in `.repo.ts` (`review.repo.ts`, `run.repo.ts`); the facade stays `repository.ts`.
- Test files: `*.test.ts` for unit tests; `*.it.test.ts` for integration tests that import `test/helpers/pg.ts` (Testcontainers Postgres) — required, not just a convention (see Gotchas).
- Zod contracts (`src/vendor/shared/contracts/*.ts`): `export const X = z.object({...}); export type X = z.infer<typeof X>;` — the schema and its inferred type share the same PascalCase name. Enum-like unions are `z.enum([...])`, never a TS `enum`.

## Gotchas
- Migrations don't run on boot — `relation does not exist` almost always means "run `pnpm db:migrate`".
- `REPO_INTEL_ENABLED` defaults to `true` but silently degrades to diff-only if the repo isn't indexed yet — no error, just less context.
- Prompt-injection defense is one shared `INJECTION_GUARD` rule appended to every agent prompt, not keyword scanning — don't add denylist-style filtering.
- Grounding gate drops any finding whose cited line isn't in the diff and recomputes the score — the model's self-reported score is never trusted.
- `EMBEDDINGS_ENABLED=false` (default) means zero OpenAI calls even with a key set.
- A test importing `test/helpers/pg.ts` must be named `*.it.test.ts` or the unit/integration split breaks.

## Do not touch
- `src/db/migrations/` — past migration files are immutable; add a new one, never edit an applied one.
- `src/vendor/shared` — shared across `client/` and `reviewer-core/`; changes need a matching update in both.
- Course-lesson tables/modules on `main` — the schema already has every future-lesson table; lesson work belongs in forks, not `main`.
- `pnpm-lock.yaml` — regenerate via `pnpm install`, never hand-edit; a hand-edited lockfile can silently desync from `package.json` and break reproducible installs.

## Read When
- Usage & full API/env reference → [README.md](README.md)
- Touching the DI container or adding/changing an adapter → `docs/architecture.md`
- Changing the review pipeline (trigger → persistence → completion) → `specs/review-flow.md`
- Decisions & gotchas log → `Insights.md`
