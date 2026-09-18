# server — Spec: the review-run flow

This is the contract a change to the review pipeline must keep true. It covers one full cycle from trigger to UI-visible result.

## 1. Trigger

`POST /pulls/:id/review` (`src/modules/reviews/routes.ts`) resolves `workspaceId` via `getContext`, validates the body against the `RunRequest` Zod contract, and resolves target agents via `ReviewService.resolveTargets` (`modules/reviews/service.ts`).

## 2. Fire-and-forget orchestration

`ReviewService.runReview` creates one `agent_runs` row per target agent **up front** (so the client gets an immediate `runId` to subscribe to over SSE), then calls `this.executor.executeRuns(...)` **without awaiting** it, and returns `{ runs, reviews: [] }` immediately. The review itself happens in the background — `reviews` is empty in the synchronous response by design.

## 3. Execution

`ReviewRunExecutor.executeRuns` (`modules/reviews/run-executor.ts`) loads the PR diff once, shared across every queued agent, then loops per agent in `runOneAgent`, which:

1. Resolves the LLM via `container.llm(agent.provider)`.
2. Optionally builds repo-intel enrichment (callers digest, repo-map digest, rank note) when `REPO_INTEL_ENABLED`.
3. Calls `reviewPullRequest(...)` from `@devdigest/reviewer-core` — the shared map-reduce engine (see `reviewer-core/docs/architecture.md`).

## 4. The engine's contract (must stay true)

- Mode selection is deterministic: `single-pass` unless the diff is large + multi-file (map-reduce threshold: 400 changed lines).
- Findings are merged across chunks (worst verdict wins, mean score, findings concatenated), then **must** pass the grounding gate — `groundFindings(findings, diff)` drops any finding whose cited line isn't in the diff (except full-file-kind findings: `secret_leak`/`lethal_trifecta`/`phantom`/`hook`, which only require the file to appear).
- The score is **recomputed from the grounded survivors only** — the model's self-reported score is never trusted, even after grounding.

## 5. Persistence

Back in `run-executor.ts`: `insertReview` writes the `reviews` row; `insertFindings(review.id, keptFindings)` writes one `findings` row per grounded finding (mapping `Finding.start_line` → `startLine` etc.); `markReviewed(pull.id, pull.headSha)` stamps the reviewed commit so the PR's review-status derivation (`modules/pulls/status.ts`'s `deriveReviewStatus`) can tell "reviewed" from "needs_review".

## 6. Deterministic blockers, never the model's verdict

`countBlockers(keptFindings, agent.ciFailOn)` (from `@devdigest/reviewer-core`'s `output/to-review.ts`) computes the blocker count from severity ranks against the agent's configured CI gate — this is what the UI shows as "N blockers", and it is independent of whatever `verdict` the model returned.

## 7. Completion

`completeAgentRun(runId, { status: 'done', durationMs, tokensIn, tokensOut, costUsd, findingsCount, grounding, score, blockers, error: null })` writes the final `agent_runs` row. A `RunTrace` document (prompt assembly, per-chunk tool_calls, raw output, full event log) is saved via `saveRunTrace`, and `container.runBus.complete(runId)` signals SSE subscribers that the run is done.

## 8. What the client reads

- `GET /pulls/:id/runs` / `/runs/active` — the Timeline (`RunSummary[]`, includes `cost_usd`, `findings_count`, `blockers`, but no per-severity breakdown or the findings themselves).
- `GET /pulls/:id/reviews` — the Review-runs section (`ReviewRecord[]`, each with its full `findings: FindingRecord[]`) — this is the one place all of a PR's findings across every run are already fetched together.
- `GET /runs/:id/events` — SSE stream bridging `container.runBus` for live progress while a run is still executing.
- `GET /repos/:id/pulls` — the PR list; aggregates the **latest** review's score + severity counts and the **sum of every run's** known cost, computed in the list handler itself (`modules/pulls/routes.ts`), not by the engine.

## Failure path

On error or cancellation (`run-executor.ts`'s `catch`), the run is marked `failed`/`cancelled` with `tokensIn: 0, tokensOut: 0, findingsCount: 0` and **no `costUsd`** (defaults to `null` via `completeAgentRun`'s `costUsd ?? null`) — a failed run never contributes to the PR-list's summed cost or to any severity count, by construction, not by an extra filter at read time.
