# reviewer-core — Architecture: the review pipeline

`reviewer-core` is a pure library — no DB, GitHub, or filesystem access; its only side effect is an **injected** `LLMProvider`. `index.ts` is the sole public surface consumers (server/, the CI runner) import through; renaming or removing an export there breaks the server build silently until typecheck.

## Prompt assembly (`prompt.ts`)

`assemblePrompt(parts: PromptParts)` builds the `{system, user}` chat messages sent to the LLM. Two things are load-bearing here:

- **`INJECTION_GUARD`** — one shared constant appended to every system prompt, regardless of agent or provider. There is no keyword/denylist scanning anywhere else — this is the single defense against prompt injection in the diff/PR text.
- **`wrapUntrusted(label, content)`** — wraps every piece of untrusted content (the diff, the PR description, the repo map, the callers digest) in a labeled block, escaping any embedded closing delimiter so untrusted text can't fake its way out of its own wrapper.

## Grounding (`grounding.ts`)

`groundFindings(findings, diff)` is the mandatory citation gate: a finding is kept only if its `[start_line, end_line]` intersects a real diff hunk for that file. The one exception is `FULL_FILE_KINDS` (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) — these only need the *file* to appear in the diff, not a specific line range, since they're about file-level properties rather than a single line.

## The engine (`review/run.ts`, `review/reduce.ts`)

`reviewPullRequest(input)` is the map-reduce orchestrator:

1. **Mode selection** is deterministic — `single-pass` unless the diff is large and multi-file (the `map-reduce` threshold is 400 changed lines), or the caller forces `strategy: 'map-reduce'`.
2. Each chunk (the whole diff, or one per file in map-reduce mode) gets its own `assemblePrompt` call and its own `llm.completeStructured<Review>()`, accumulating `tokensIn`/`tokensOut`/`costUsd` across chunks.
3. Partial `Review`s are merged by `reduceReviews` — worst verdict wins, mean score, findings concatenated.
4. The merged findings are run through `groundFindings`, and the score is recomputed from the grounded survivors via `scoreFromFindings` — **the model's self-reported score is discarded**, even the merged/averaged one from step 3.

## CI-facing output (`output/to-review.ts`)

- `toReviewPayload(review, opts)` — turns a grounded `Review` into the GitHub review payload (comment body + inline comments).
- `severityCounts(findings)` — tallies `CRITICAL`/`WARNING`/`SUGGESTION`, used to build the human-readable comment text ("X critical · Y warning · Z suggestion").
- `gateTriggered(findings, failOn)` / `countBlockers(findings, failOn)` — the deterministic CI gate, driven by `SEV_RANK` (`SUGGESTION: 1, WARNING: 2, CRITICAL: 3`) and `FAIL_ON_MIN_RANK` (mapping `never|critical|warning|any` to a minimum rank). Neither function looks at the model's `verdict` field.

## What's exported (`index.ts`)

`assemblePrompt`/`wrapUntrusted` (prompt), `groundFindings`/`groundingSummary` (grounding), `toJsonSchema`/`extractJson`/`parseWithRepair` (structured-output helpers), `reduceReviews`/`sliceDiff` (map-reduce), `reviewPullRequest` + its types (the engine entry point), `toReviewPayload`/`gateTriggered`/`countBlockers` (output), and `OpenRouterProvider` — the one concrete `LLMProvider` implementation that lives in this package (shared by the server and the CI runner, since both need an LLM call that isn't tied to the server's DI container).
