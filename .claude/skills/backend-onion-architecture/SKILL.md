---
name: backend-onion-architecture
description: "Onion/hexagonal architecture guidance for the backend packages (`@devdigest/api` in server/ — Fastify 5 + Drizzle ORM + Postgres/pgvector — and `@devdigest/reviewer-core`, a pure library): which layer new code belongs in, how routes/service/repository/adapters must depend on each other, and where the dependency direction may not be violated. Use proactively whenever adding a new Fastify module, adding or changing a repository method, adding a new adapter/port, deciding where a piece of business logic belongs in server/ or reviewer-core, or reviewing an existing module for layer violations. Does NOT cover Fastify request-lifecycle mechanics (schemas, hooks, serialization — see fastify-best-practices), Drizzle query syntax (see drizzle-orm-patterns), or frontend organization (see frontend-ui-architecture)."
user-invocable: false
version: 1.0.0
---

# Backend Onion Architecture

Architecture guidance for `@devdigest/api` (`server/`) and `@devdigest/reviewer-core` — this repo's two backend packages. This skill is deliberately narrow: it answers **which layer a piece of backend code belongs in and which direction it's allowed to depend**, not how to write a Fastify route or a Drizzle query correctly. For those, defer to `fastify-best-practices` and `drizzle-orm-patterns`.

Full annotated bibliography and open tradeoffs: [research-notes.md](./research-notes.md). Worked example against a real module: [references/backend-layering.md](./references/backend-layering.md).

## The one rule underneath everything else

Across Onion, Hexagonal, and Clean Architecture writing, one rule is non-negotiable regardless of which vocabulary a source uses:

> **Dependencies point inward, never outward. Inner layers define interfaces; outer layers implement them.** Code closer to the domain must never import from — or even know the name of — a concrete Fastify type, a Drizzle table, or a specific adapter's implementation class.

`server/` already implements most of this — it is **not a blank slate**. `src/platform/container.ts` already gives ports (`LLMProvider`, `GitHubClient`, `GitClient`, …) a prod-implementation + mock-implementation pair, documented in `server/docs/architecture.md`. `reviewer-core/` is already a fully dependency-free core (zero DB/GitHub/filesystem access, one injected `LLMProvider`). This skill's job is to keep new code consistent with what's already there — not to introduce a new pattern.

## Layer map, translated into this repo's actual folders

| Layer | Where it lives | Rule |
|---|---|---|
| Domain / contracts (innermost) | `server/src/vendor/shared/contracts/*` (Zod schemas + inferred types, shared with `client/` and `reviewer-core/`) | No imports of Fastify, Drizzle, or any adapter. Pure shape definitions. |
| Application / use-case | `modules/<name>/service.ts` | Orchestration only: calls the module's repository facade and `container.<port>`. **Never** imports `fastify`, `drizzle-orm`, or `src/db/schema` directly. |
| Data access | `modules/<name>/repository/*.repo.ts` + `repository.ts` facade | The *only* files allowed to import `drizzle-orm` / `src/db/schema` for that domain (see `server/src/modules/reviews/repository.ts`'s own header comment — "the ONLY layer touching the DB for the review domain"). The facade class is constructed directly by `service.ts` (not resolved through `container`) — that's this repo's existing convention for repositories, distinct from the container-mediated port pattern below; don't conflate the two. |
| Ports / adapters (outer ring) | `src/adapters/<name>/` (prod implementations) + `src/adapters/mocks.ts`, wired through `src/platform/container.ts` | Already correct — extend this pattern for any new external integration (a new port interface in `vendor/shared/adapters.ts`, a prod adapter under `src/adapters/<name>/`, a mock in `mocks.ts`). Don't add a second DI mechanism (no InversifyJS/tsyringe/decorators) — extend `container.ts`. |
| Delivery (outermost) | `modules/<name>/routes.ts` | Zod `params`/`body` validation and HTTP translation only. No direct `db`/adapter imports, no business rules — call `service.ts` and shape the response. |
| Composition root | `src/platform/container.ts` + `src/modules/index.ts` + `src/app.ts` | The one place allowed to know about every layer. New module = new import + `app.register` here, per `server/AGENTS.md`. |

## `reviewer-core/` as the reference example of a pure core

`reviewer-core/` has **zero** DB, GitHub, or filesystem access — its only side effect is an injected `LLMProvider`. This is what a fully dependency-free Onion core looks like in this repo already: `prompt.ts`, `grounding.ts`, and `review/*.ts` hold pure orchestration logic and never import anything infrastructure-specific. When in doubt about how "pure" a use-case/service layer should be, point at `reviewer-core/` rather than inventing a hypothetical ideal.

## Adding a new module — apply the layers, but proportionally

1. Domain shape → a Zod contract in `vendor/shared/contracts/`.
2. Orchestration → `modules/<name>/service.ts`, calling a repository facade + `container.<port>`.
3. Persistence → `modules/<name>/repository.ts` (+ `repository/<aggregate>.repo.ts` files once a domain has multiple aggregates, per `server/AGENTS.md`'s naming convention).
4. HTTP → `modules/<name>/routes.ts`, registered in `src/modules/index.ts`.
5. New external integration → a port interface in `vendor/shared/adapters.ts`, a prod adapter under `src/adapters/<name>/`, a mock in `src/adapters/mocks.ts`, wired into `container.ts`.

**Caveat that matters more than the rule itself**: several sources are explicit that full repository-interface + DTO-mapping layers are overkill for a genuinely thin CRUD-over-one-table module — don't add ceremony a module doesn't need. The dependency direction (routes never touch Drizzle, `service.ts` never touches Fastify) is not optional; how many discrete files/interfaces a module needs to express that direction scales with the module's actual complexity. See the "when to skip this" section in [research-notes.md](./research-notes.md).

## Common violations to flag in review

- A route handler importing `src/db/schema` or a Drizzle table directly instead of going through `service.ts` → repository.
- `service.ts` importing a concrete adapter class (e.g. `OpenAIProvider`) instead of going through `container.<port>`.
- A repository method returning a raw Drizzle-inferred row type to a caller outside its own module boundary when the shape needs to diverge from the DB row (map to a domain/DTO type instead — see `research-notes.md` § 4 for the concrete Drizzle-mapper pattern).
- Reaching for a new DI library, decorator-based container, or global singleton instead of extending `container.ts`'s existing port + prod/mock pattern.
- Business rules (validation beyond Zod shape-checking, scoring, grounding, orchestration order) leaking into `routes.ts`.

## What this skill deliberately does not enforce (yet)

`dependency-cruiser` is already a devDependency in `server/package.json` and is the natural tool to turn these rules into a CI-enforced ruleset (forbidding `modules/*/service.ts` → `drizzle-orm`, `modules/*/routes.ts` → `src/db/**`, etc.). That configuration is **not** part of this skill — it's guidance for Claude's own code placement today, with automated enforcement noted as a follow-up in [references/backend-layering.md](./references/backend-layering.md) rather than built now.
