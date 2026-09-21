# Backend layering — worked example & enforcement sketch

## Worked example: `server/src/modules/reviews/`

Traced against the layer map in `SKILL.md` (as of this writing — re-check if the module has changed):

- **Delivery** — `routes.ts`: imports `fastify`, `fastify-type-provider-zod`, shared Zod contracts (`RunRequest`, `IdParams`), `getContext` (request-scoped tenancy helper), `NotFoundError`, and `ReviewService`. No `db`, no adapter, no Drizzle import. Matches the rule.
- **Application / use-case** — `service.ts`: constructed with the `Container`; builds its own `ReviewRepository` and `ReviewRunExecutor` in its constructor, reads `container.agentsRepo`. Orchestrates the review pipeline (diff → prompt → LLM call → grounding → persistence) without importing Fastify or Drizzle directly.
- **Data access** — `repository.ts` (facade) + `repository/{review,run,pull}.repo.ts`: the only files in this module that import `drizzle-orm`/`src/db/schema`. `repository.ts`'s own header comment states it explicitly: "the ONLY layer touching the DB for the review domain."
- **Ports/adapters** — not owned by this module; `service.ts` reaches them via `container.<port>` (e.g. the LLM port), which resolves to a prod adapter under `src/adapters/llm/` or a mock in tests.
- **Composition root** — this module is registered in `src/modules/index.ts` and its DB dependency (`container.db`) is threaded in from `src/app.ts`'s `buildApp`.

One nuance worth carrying forward: `ReviewRepository` is a **concrete class**, constructed directly by `service.ts` — not an interface resolved through `container`, unlike the adapter ports. That's consistent with this repo's existing convention (repositories aren't swapped via mocks; integration tests use a real Testcontainers Postgres instead — see `server/AGENTS.md`'s `.it.test.ts` convention). Don't "fix" this by forcing repositories into the container's port pattern; the two DI shapes are intentionally different for different reasons (adapters need swappable mocks for unit tests; repositories are validated against a real DB in integration tests instead).

Some of `ReviewRepository`'s methods (e.g. `getRepo(): Promise<typeof t.repos.$inferSelect | undefined>`) currently return raw Drizzle-inferred row types rather than a mapped domain/DTO shape. Acceptable today given the module's single consumer and size — flag as the place to introduce a mapper (per the Drizzle-repository research in `research-notes.md` § 4) if this module's row shape and its callers' needs ever diverge.

## Enforcement sketch — NOT implemented, for a future follow-up

`server/package.json` already lists `dependency-cruiser` as a devDependency, but there's no `.dependency-cruiser.cjs` in the repo yet. If/when this skill's rules are validated in practice and someone wants to promote them from "Claude follows this" to "CI fails on violations," a starting ruleset would look roughly like:

```js
// server/.dependency-cruiser.cjs (SKETCH — not created by this skill)
module.exports = {
  forbidden: [
    {
      name: 'service-no-fastify-or-drizzle',
      comment: 'service.ts must not depend on Fastify or Drizzle directly',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/service\\.ts$' },
      to: { path: '^(node_modules/fastify|node_modules/drizzle-orm|src/db/schema)' },
    },
    {
      name: 'routes-no-db-or-adapters',
      comment: 'routes.ts must not touch the DB or a concrete adapter directly',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^(src/db|src/adapters/(?!mocks\\.ts))' },
    },
    {
      name: 'only-repo-files-touch-drizzle',
      comment: 'only *.repo.ts / repository.ts may import drizzle-orm or the schema',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(?!repository)' },
      to: { path: '^(node_modules/drizzle-orm|src/db/schema)' },
    },
  ],
};
```

This is illustrative, not tested against the real dependency graph — running `dependency-cruiser` against the existing codebase first (in report-only mode) would surface how many violations already exist before turning any rule into a CI failure.
