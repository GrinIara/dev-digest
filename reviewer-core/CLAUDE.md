# reviewer-core — agent map

## Session protocol
Before working in this module, read `Insights.md`. When a session surfaces a substantial, non-obvious finding, use the `engineering-insights` skill to append it (skip if nothing new).

## Stack
TypeScript 5.7 · Zod 3 · `openai` SDK (used by the LLM adapter). Pure library —
no DB, GitHub, or filesystem access; the only side effect is an **injected**
`LLMProvider`. Never emits JS: `build` is just a type-check, consumed as
TypeScript source via a tsconfig path alias.

## Commands
- `npm run typecheck` — doubles as the build (no emitted JS)
- `npm test` — vitest, fully hermetic (stubbed `LLMProvider`, no keys/network)
- `npm run lint`

## Map
- `prompt.ts` — `assemblePrompt()`, `wrapUntrusted()` + `INJECTION_GUARD`
- `llm/openrouter.ts` — the `LLMProvider` implementation; `llm/structured.ts` — Zod → JSON Schema, parse-with-repair
- `grounding.ts` — `groundFindings()`, the mandatory citation gate
- `review/run.ts` — orchestrates a single-pass run; `review/reduce.ts` — map-reduce path (fed by L06)
- `output/to-review.ts` — `toReview()`, the CI payload helper (fed by L06)
- `index.ts` — the public API surface; everything consumers import goes through here

## Conventions (non-default)
- Add no side effects beyond the injected `LLMProvider` — no DB/GitHub/filesystem calls, or the mock-testability contract breaks.
- Consumed as TypeScript source via a tsconfig path alias (`@devdigest/reviewer-core` → `../reviewer-core/src`) — don't assume a compiled `dist`.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are course-lesson hooks; `assemblePrompt` must keep omitting them cleanly when absent — don't make any of them required.

## Naming conventions
- One file per pipeline concern, named after the concern, not a generic bucket: `prompt.ts`, `grounding.ts` at the top level; `review/*.ts` for the map-reduce engine; `output/*.ts` for CI-facing formatting.
- Tests are all plain `*.test.ts` — this package is fully hermetic (stubbed `LLMProvider`, no DB/network), so there's no `*.it.test.ts` split like `server/` has.
- Zod contract naming matches `server/`'s convention (shared file): `export const X = z.object(...); export type X = z.infer<typeof X>`.

## Gotchas
- Grounding is mandatory and mechanical: a finding without a real diff-line citation is dropped, and the score is recomputed from survivors — the model's self-reported score is never trusted.
- Prompt-injection defense is the single shared `INJECTION_GUARD` text appended to every prompt, not keyword/denylist scanning — don't add text-parsing defenses.

## Do not touch
- `index.ts` exports — `server/` imports this package by name via a path alias; renaming or removing an export breaks the server build silently until typecheck.
- `package-lock.json` — regenerate via `npm install`, never hand-edit.

## Read When
- Usage & pipeline diagram → [README.md](README.md)
- Touching prompt assembly, grounding, or the map-reduce engine → `docs/architecture.md`
- Changing the Finding/Review shape or the CI-gate behavior → `specs/review-contract.md`
- Decisions & gotchas log → `Insights.md`
