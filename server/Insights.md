# server — Insights

Append-only log of gotchas and non-obvious decisions discovered *after* the
fact — not upfront design. If an entry becomes load-bearing enough that every
session needs it, promote it into `CLAUDE.md` instead. Don't duplicate an
existing entry, even reworded — extend it instead. Past ~150 entries, move
older/superseded ones into `Insights-archive.md`.

Format:

## YYYY-MM-DD — [Category] short title
What happened, what was decided, why. (Category: Pattern, Mistake, Decision, or Context.)

## 2026-09-18 — [Context] Agent-run cost was already computed, just never persisted
Before the "agent run cost" feature (branch `feat/agent-run-cost`), reviewer-core's `reviewPullRequest()` already returned `ReviewOutcome.costUsd` (real cost from OpenRouter's `usage.cost` extension, falling back to `PriceBook`/`estimateCost`), and the OpenAI/Anthropic adapters (`server/src/adapters/llm/openai.ts`, `anthropic.ts`) already computed `costUsd` via `estimateCost()`. It was silently dropped in `server/src/modules/reviews/run-executor.ts:213` (`const { tokensIn, tokensOut, grounding } = outcome;` never destructured `costUsd`) before reaching `completeAgentRun()` — `agent_runs` had no `cost_usd` column at all. When a request says "add cost tracking," check whether the value is already computed upstream and just needs plumbing through persistence + contracts + UI, rather than assuming new cost math is needed. Also: `server/src/vendor/shared/contracts/observability.ts` already had `cost_usd`/`total_cost_usd`/`avg_cost_usd` fields for the separate Multi-Agent Review feature (`AgentColumn`, `MultiAgentRun`, `AgentStats`) — unimplemented, but they set the field-naming convention (`cost_usd`, nullable) that new `RunStats`/`RunSummary`/`PrMeta` fields should match for consistency.

## 2026-09-18 — [Context] `repository.ts`'s method param types are copy-pasted, not imported, from `run.repo.ts`
`server/src/modules/reviews/repository.ts`'s `completeAgentRun()` wrapper re-declares its own inline parameter type instead of importing it from `server/src/modules/reviews/repository/run.repo.ts`. Adding a field to `run.repo.ts`'s `completeAgentRun` signature (e.g. `costUsd`) requires a matching manual edit in `repository.ts` too, or the call site in `run-executor.ts` fails to typecheck with an "object literal may only specify known properties" error that points at the call site, not the actual mismatched type in `repository.ts`.

## 2026-09-18 — [Decision] `main` is the starter state — branch before feature work, confirm if unstated
`server/CLAUDE.md`'s "main is the course-starter state; lesson/feature work happens in forks" rule is actively enforced — the git log has a real `revert: restore main to the starter state, homework belongs in forks` commit. Confirmed with the user during the "agent run cost" feature that this meant creating a branch (`feat/agent-run-cost`) first, not committing to `main`. This convention applies repo-wide (client/e2e/reviewer-core included), not just server.

## 2026-09-18 — [Context] `server/src/vendor/shared` and `client/src/vendor/shared` are hand-mirrored, not a single source of truth
Both packages vendor their own copy of the same Zod contracts (e.g. `contracts/trace.ts`, `contracts/platform.ts`). Every contract change (e.g. adding `cost_usd` to `RunStats`/`RunSummary`/`PrMeta`) must be applied identically to both files by hand — TypeScript won't catch a missed side since they're structurally separate packages, not a shared import. Diff the two files after any shared-contract edit to confirm they match.
