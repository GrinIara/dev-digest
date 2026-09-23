# dev-digest — Architecture & Organization Improvement Plan

Generated 2026-09-20. Produced by reviewing all five packages (`client/`, `server/`, `reviewer-core/`, `e2e/`, `server/src/vendor/shared`) against the installed skills that apply to each: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` (client), `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `security`, `typescript-expert` (server, reviewer-core), plus direct code review where no skill applied (e2e). Each package's `AGENTS.md`/`Insights.md` was read first; anything already logged there as an accepted tradeoff is noted but not re-flagged as a new finding.

This is an analysis/planning document, not a changelog — nothing listed here has been fixed yet.

## How to read this

Findings are tagged **high / medium / low** per package. "High" means either a real security/correctness gap or a structural issue actively causing duplicated/hard-to-maintain code today — not a style preference. Treat this as a punch list to work through, not a mandate to rewrite anything; every finding below is a targeted, mechanical fix, not a call for restructuring.

---

## Do-first: cross-cutting high-priority items

Ranked by blast radius if left alone:

1. **reviewer-core — grounding bypass for the most dangerous finding kinds.** `secret_leak`/`lethal_trifecta` findings skip all line-range verification in `groundFindings` (`src/grounding.ts`), and the `Finding.evidence` field that exists specifically to substantiate them is defined but never read. This is the exact category the mandatory citation gate exists to constrain. → ground `evidence[].line` against the diff's line index; consider requiring non-empty `evidence` for that kind.
2. **server — `pulls/` module has no service/repository layer.** ~280 lines of GitHub sync, diff-stat backfill, and aggregation logic live directly in `routes.ts`, duplicated again in `polling/routes.ts`. Every other module (`repos/`, `reviews/`, `agents/`) follows a clean routes→service→repository split; this one doesn't. → extract `PullsService`/`pulls/repository.ts`.
3. **server — missing FK indexes across the entire reviews/observability schema.** `reviews`, `findings`, `agent_runs`, `pr_files`, `pr_commits`, and others have zero indexes despite being hit by hot queries (`reviewsForPull`, `listRunsForPull`, PR-list cost rollups). Will sequential-scan as data grows. → add indexes on `reviews.pr_id`, `reviews.workspace_id`, `findings.review_id`, `agent_runs.workspace_id`, `agent_runs.pr_id`, `agent_runs.agent_id`, `pr_files.pr_id`, `pr_commits.pr_id`.
4. **server — vendor/shared drift is real today, not hypothetical.** `server/src/vendor/shared` and `client/src/vendor/shared` have diverged in 5 files beyond what `Insights.md` already tracks, including a provider enum mismatch (`'openrouter'` exists server-side, not client-side) that will fail client-side Zod validation for openrouter-backed agents right now. → add a checked sync script + CI diff check, or reconsider vendoring vs. path-aliasing for this pair.
5. **client — `ConfigTab` textbook "reset via effect" anti-pattern.** Nine `useState` fields synced from props via a `useEffect` with a suppressed lint rule; switching agents renders stale data for one frame before the effect resets. → key the component by `agent.id` instead (React's own recommended fix), or collapse to `useReducer`.
6. **client — primary navigation surfaces aren't keyboard-reachable.** PR rows and agent cards navigate via bare `<div onClick>` with no `role`/`tabIndex`/`<Link>`; two icon buttons (`RunHistory`, `Dropdown`) are `role="button"` with no keyboard handler, inconsistent with the correct pattern already used elsewhere in the same codebase (`ReviewRunAccordion`). → swap to `next/link` `<Link>` for navigation; add `tabIndex`/`onKeyDown` or use real `<button>` for the icon actions.
7. **e2e — malformed flow JSON can crash the entire suite and erase all prior results.** An unchecked cast plus a `resolveArgs` call outside the per-step `try` means one bad/typo'd spec file aborts the whole run before `summarize()` prints anything — undermining the documented "one flow's failure doesn't abort the suite" guarantee. → validate flow shape after `JSON.parse` (a `zod` schema fits), or move `resolveArgs` inside the step's `try`.
8. **server — one secret-writing route skips the auth chokepoint.** `POST /settings/test-connection` never calls `getContext()`, unlike every other route including plain reads. Harmless under today's no-auth provider, but will silently stay unauthenticated the moment real auth is wired in. → add the `getContext()` call now, even though its return value isn't used yet.

---

## client/ — full findings

_Skills applied: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`_

### Architecture & Organization
| # | Finding | Location | Priority |
|---|---|---|---|
| 1 | `RunHistory.tsx` breaks the codebase's own colocation convention (no `styles.ts`/`index.ts`, inline styles, un-extracted row kinds) | `_components/RunHistory/RunHistory.tsx` | medium |
| 2 | `/agents/[id]/page.tsx` is not thin — sidebar/header markup inline instead of delegated | `app/agents/[id]/page.tsx` | low/medium |
| 3 | PR detail page carries derived-data logic that belongs in a hook | `app/repos/[repoId]/pulls/[number]/page.tsx` | low |
| 4 | Stale comment claims a `/showcase` route exists; it doesn't | `components/showcase/Showcase.tsx` | low |

### React
| # | Finding | Location | Priority |
|---|---|---|---|
| 5 | 9-`useState`-plus-reset-`useEffect` anti-pattern; should key-remount instead | `_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx` | **high** |
| 6 | Passthrough `useCallback` wrappers with no memoization benefit | `_components/FindingsTab/FindingsTab.tsx` | low |
| 7 | Two `role="button"` elements with no keyboard support (inconsistent with the correct pattern used elsewhere) | `RunHistory.tsx`, `vendor/ui/kit/Dropdown.tsx` | **high** |
| 8 | Whole-row/card navigation via bare `<div onClick>` — no semantic link, no keyboard access | `PRRow.tsx`, `AgentCard.tsx` | **high** |
| 9 | Inconsistent state-vs-URL treatment: `status` filter is URL-backed, `query`/`sort` on the same page aren't | `app/repos/[repoId]/pulls/page.tsx` | medium |

### Next.js
| # | Finding | Location | Priority |
|---|---|---|---|
| 10 | No `@next/eslint-plugin-next` wired in — confirmed by the build's own warning; Next-specific lint rules never run | `eslint.config.mjs` | medium |

Verified, not a finding: no Server Components/DAL/Server Actions layer is a documented, accepted tradeoff (`client/docs/ui-architecture.md`) for a thin client over an external API; the suspected `useSearchParams`-without-`Suspense` issue does not actually surface in `pnpm build`.

**Overall:** naming/colocation conventions are followed almost everywhere; no component exceeds ~290 lines; the single-fetch-base rule has zero violations. Problems cluster in one real React anti-pattern (#5) and a recurring accessibility/semantics gap on primary navigation (#7, #8) that's inconsistency, not an unknown technique — it's already done correctly once elsewhere in the same codebase.

---

## server/ — full findings

_Skills applied: `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `security`, `typescript-expert`_

### Fastify & Module Architecture
| # | Finding | Location | Priority |
|---|---|---|---|
| 1 | `pulls/` has no `service.ts`/`repository.ts` — business logic + raw Drizzle queries live in route handlers | `modules/pulls/routes.ts` | **high** |
| 2 | Duplicated GitHub PR-sync-upsert logic between two modules (direct consequence of #1) | `modules/pulls/routes.ts`, `modules/polling/routes.ts` | medium |

### Database (Drizzle/Postgres)
| # | Finding | Location | Priority |
|---|---|---|---|
| 3 | No indexes on FK columns actually queried, across the whole reviews/observability schema | `db/schema/reviews.ts`, `db/schema/runs.ts`, migrations | **high** |
| 4 | Enum-like columns (`severity`, `category`, `status`, `grounding`) have no DB-level CHECK/pgEnum — only Zod enforces validity | `db/schema/reviews.ts`, `db/schema/runs.ts`, `db/schema/pulls.ts` | medium |
| 5 | `users.email`/`workspaces.name` have no UNIQUE constraint but are looked up as if unique | `db/schema/core.ts`, `adapters/auth/local.ts` | medium |

### Zod Contracts & Validation
| # | Finding | Location | Priority |
|---|---|---|---|
| 6 | `Settings.passthrough()` + `PUT /settings` writes arbitrary keys to Postgres with zero shape validation (by design — flagged for downstream awareness) | `vendor/shared/contracts/platform.ts`, `modules/settings/routes.ts` | low |
| 7 | One route hand-parses `req.body` instead of using the schema pipeline (deliberate, safety-netted, documented exception) | `modules/reviews/routes.ts:32` | low |

### Security
| # | Finding | Location | Priority |
|---|---|---|---|
| 8 | `POST /settings/test-connection` never calls `getContext()`, unlike every other route | `modules/settings/routes.ts` | **medium-high** |
| 9 | `getRunTrace`/`cancelRunIfRunning` don't verify workspace ownership (IDOR gap once multi-tenant auth ships) | `modules/reviews/repository/run.repo.ts` | medium |
| 10 | GitHub PAT embedded in clone URL; clone-failure error messages persisted verbatim to DB (possible plaintext token at rest) | `modules/repos/helpers.ts`, `platform/jobs.ts` | medium |
| 11 | Secrets adapter not directly inspectable this pass (sandboxed) — implies plaintext-on-disk storage per `AGENTS.md`, fine for localhost-only use | `adapters/secrets/local.ts` | low (flagging the gap, not a confirmed issue) |

### Cross-Package Shared Contract Sync
| # | Finding | Location | Priority |
|---|---|---|---|
| 12 | `server/src/vendor/shared` vs `client/src/vendor/shared` have already diverged in 5 files (provider enum, missing `GitHubClient` methods, missing agent-manifest types); no sync script/CI check exists anywhere | `src/vendor/shared/*` (both copies) | **high** |

**Overall:** core modules (`repos/`, `reviews/`, `agents/`) show a genuinely good, consistently-applied routes→service→repository architecture. The weak points are concentrated in `pulls`/`polling` (never got a service layer) and a handful of DB-design gaps that are inconsistent with the care visible elsewhere in the same schema. The vendor/shared drift, previously logged as an accepted theoretical risk, is now a measured, real divergence.

---

## reviewer-core/ — full findings

_Skills applied: `typescript-expert`, `zod`, `security`_

### Public API & Module Boundaries
| # | Finding | Location | Priority |
|---|---|---|---|
| 1 | Map-reduce run trace records the whole-diff prompt assembly, not what was actually sent per chunk | `review/run.ts` | medium |
| 2 | `sliceDiff` fallback can silently return the entire diff instead of erroring on an unmatched path (public API, currently unreachable internally) | `review/reduce.ts` | low/medium |
| 3 | `reduceReviews`'s `score` field is dead/discarded in its only real call path, undocumented as provisional | `review/reduce.ts`, `review/run.ts` | low |
| 4 | Explicit `strategy: 'map-reduce'` can be silently downgraded to single-pass with no signal | `review/run.ts` | low |

### Zod/Structured Output Handling
| # | Finding | Location | Priority |
|---|---|---|---|
| 5 | Final schema-validation failure discards the diagnostic Zod error instead of surfacing it | `llm/openrouter.ts` | medium |
| 6 | No unit tests for `llm/structured.ts` or `review/reduce.ts` exported functions (JSON-fence extraction, repair path, reduce merge logic) | `llm/structured.ts`, `review/reduce.ts` | medium |

### Prompt-Injection & Untrusted-Input Safety
| # | Finding | Location | Priority |
|---|---|---|---|
| 7 | Citation gate bypass for `secret_leak`/`lethal_trifecta` is keyed off a model-self-declared field; `evidence` array never checked | `grounding.ts` | **high** |
| 8 | `skills` prompt slot bypasses `wrapUntrusted` despite its own comment flagging it as not-always-sanitized | `prompt.ts` | medium |
| 9 | `wrapUntrusted`'s delimiter escape only strips the exact literal `</untrusted>`; no test pins this behavior | `prompt.ts` | low/medium |
| 10 | LLM-authored finding text (`title`/`rationale`/`suggestion`) interpolated unsanitized into the posted GitHub review body | `output/to-review.ts` | medium/high |

**Overall:** module boundaries cleanly match a ports/pure-domain-logic/adapter shape; TypeScript discipline is genuinely good (strict mode, zero `any`). Risk concentrates exactly where the docs say the load-bearing logic lives — the injection guard and citation gate are each slightly less airtight than their documentation implies, and the code that feeds both is undertested relative to how much trust the rest of the system places in it.

---

## e2e/ — full findings

_No dedicated skill — direct code review._

| # | Finding | Location | Priority |
|---|---|---|---|
| 1 | Malformed/unexpected flow JSON crashes the entire suite, losing all prior results — undermines the documented "isolated failure" guarantee | `run.ts`, `lib/assert.ts` | **high** |
| 2 | Identical 5-step "navigate to PR #482 detail" prefix duplicated verbatim across 3 flow files, including a hardcoded seed title | `specs/02-*.flow.json`, `specs/04-*.flow.json`, `specs/05-*.flow.json` | medium |
| 3 | `Step.assert.stdoutIncludes` is unused dead surface area — zero specs exercise it | `lib/assert.ts` | low |
| 4 | No unit tests for the runner's own pure helpers (`resolveArgs`, `summarize`) | `lib/assert.ts` | low |
| 5 | README's flow-anatomy example has drifted from the real `01-app-boot.flow.json` | `README.md` | low |

Verified clean: locator determinism convention followed 100% across all 7 specs; `lib/` is a single well-scoped 59-line file, not a dumping ground.

**Overall:** structurally healthy for its size and scope. Documentation is unusually thorough and mostly kept in sync with the code. The two real gaps (no flow-shape validation, duplicated navigation prefix) are concrete and fixable, not style nitpicks.

---

## Suggested sequencing

This is a suggestion, not a mandate — reorder based on what's actually being worked on:

1. **Security-adjacent fixes first** (small, independent, no design decisions needed): reviewer-core #7 and #10, server #8 and #10.
2. **Data-integrity fixes** (also independent): server #3 (indexes), server #12 (vendor/shared sync — needs a decision on approach first, see below).
3. **The one real React bug**: client #5.
4. **Accessibility pass**: client #7, #8 together (same root cause — non-semantic interactive elements).
5. **Structural cleanup where duplication is actively growing**: server #1/#2 (pulls service layer), e2e #1 (flow validation).
6. Everything else (medium/low) can be picked up opportunistically or batched into a cleanup pass.

Two items need a decision before they can be "fixed" rather than just patched:
- **server #12 / vendor/shared drift**: either build a sync/CI-check script, or accept the vendoring approach isn't working and reconsider it for this one pair.
- **client #10 / no Next.js ESLint plugin**: straightforward to add, but worth confirming it doesn't surface a large batch of new lint findings across the whole `client/` tree that would need triage.
