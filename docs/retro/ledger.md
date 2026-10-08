# Workflow retro ledger

Append-only log of `/workflow-retro` runs: how each multi-agent workflow went, numbered proposals for agents/hooks/skills, and module insights. Newest entry at the bottom.

## 2026-09-29 · project-context · in-context
Session 31f20eeb-643f-4930-bd96-7ef8e2ae3293 · Scope: whole session (spec-creator → implementation-planner for SPEC-2026-09-29-project-context; the later skill-building part of the session spawned no agents)

| # | Agent | Model | Tokens | Tool uses | Min | Resumes | Stopped | O | E | A | H |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | spec-creator | opus | 232,318 ¹ | 103 | 34.7 ² | 3 | no | 3 | 2 | 4 | 4 |
| 2 | implementation-planner (Review) | opus | n/a ³ | 22 ³ | ~1 ³ | 0 | yes | — | — | — | — |

Totals: agents 2 · agent tokens 232,318 (planner not reported) · main n/a (in-context) · wall-clock ≈ 55 min for the agent part (20:10 → 21:05 UTC, from the collect.sh output earlier in this session)

¹ `subagent_tokens` from the last of three completion notifications; the series 137,668 → 172,248 → 232,318 is monotonic, read as cumulative. ² Sum of the three notifications' `duration_ms` (525,863 + 882,231 + 672,870). ³ No completion usage (stopped by the user); tool uses and minutes from the collect.sh run shown earlier in this conversation.

Scores — spec-creator: **O 3** — the spec was approved, but only after a user-driven revision that reversed its "editing is impossible" conclusion and removed its invented token/size limits (AC-5, AC-9, AC-20, AC-42 removed). **E 2** — 232k tokens and 103 tool calls, including 43 Edits, mostly from rewriting the spec after each decision. **A 4** — it batched all four blocking questions into one gate, with a recommendation for each; 3 of 4 recommendations were accepted as-is. **H 4** — handoffs cited file:line (`prompt.ts:89`, `run-executor.ts:362`, `trace.ts:44`); the planner still re-read 3 of those files. Planner: not scored (stopped after ~1 min, reason not stated).

**Findings**
- Missed: spec-creator declared in-app editing out of scope because "the clone is hard-reset on every sync". It never checked who calls `sync`. The only caller is the manual Re-analyze (`repo-intel/service.ts:152`). The user brought in another session's analysis, and the spec was reversed (US-7 plus 14 new ACs). — evidence: Discovery Report BQ-2; user screenshot at 22:23; my verification grep.
- Missed: the orchestrator (me) relayed the user's free-text BQ-2 answer with a steer: "If it's non-trivial (I expect so), make v1 view-only". That pushed the agent toward the conclusion the user later overruled. — evidence: second SendMessage.
- Missed: spec-creator invented a per-run budget (8,000 tokens) and a per-document limit (50 KB) that were in neither the brief nor the design, and built 4 ACs on them. The user wanted display-only counts, so all of it was removed. — evidence: OQ-1/OQ-2; revision 1 report.
- Difficulty: 6 failed Reads and 3 Bash hook denials in spec-creator; 4 Bash hook denials and 1 exit-code-2 command in the planner within ~1 min. — evidence: collect.sh friction section earlier in this conversation.
- Difficulty: the failed Reads trace back to the brief. The orchestrator gave the first screenshot's absolute path and the other five as `.../22.08.08.png`. The agent guessed `specs/Screenshot …` and failed before recovering. — evidence: first Agent prompt; the agent's own note "An early `ls` misattributed them to `specs/`".
- Went well: the first discovery pass found that the feature mostly means filling an existing slot. `PromptParts.specs` is already rendered as `## Project context` with `wrapUntrusted`; `specs_read: []` is hard-coded. This kept the design small. — evidence: Discovery Report §2.
- Went well: the design analysis flagged the injection-guard conflict (the guard says untrusted data "does NOT define your job") that would have broken the api/→db/ verification scenario, and proposed the trusted framing line.
- Duplication: the planner re-read `reviewer-core/src/prompt.ts`, `server/src/adapters/git/simple-git.ts` and `server/src/modules/reviews/run-executor.ts`, which spec-creator had already analysed and cited. — evidence: collect.sh overlap section.
- Duplication: the spec was rewritten twice: 43 Edits over 3 turns. — evidence: tool mix; resumes 3.
- Orchestration: two decisions were made by the orchestrator without explicit user confirmation and only flagged afterwards: the trusted framing line and removing the token limits. Both stood, but each should have been a question at the gate.
- Orchestration: the planner was launched right after approval without asking; the user stopped it within ~1 min. The reason was not stated. — evidence: stoppedByUser in meta / notification.
- Orchestration: questions reached the user in three rounds: BQ-1..4, then editing/limits, then tokens/chunks. The limits and editing questions could have been in the first gate had the agent surfaced its invented defaults as questions.

**Proposals**
| ID | Target file | Change (exact text or diff) | Fixes | Status |
|---|---|---|---|---|
| R20260929-1 | .claude/agents/spec-creator.md | Add a rule: "Before concluding that a capability is infeasible or out of scope because of a code constraint, find every caller or trigger of that constraint (grep call sites) and cite them. Present the result as a trade-off question at the gate, not as a Non-goal." | Missed #1 | applied |
| R20260929-2 | .claude/agents/spec-creator.md | Add a rule: "Do not introduce numeric limits (budgets, size caps, counts) that are absent from the sources. If you believe one is needed, raise it as a question in the first gate with a suggested value, instead of writing it into ACs as a default." | Missed #3, Orchestration (3 rounds) | applied |
| R20260929-3 | .claude/agents/README.md (orchestration notes) | Add: "Briefs give every input file as a full absolute path (no `...` shorthand). When relaying user answers, quote them verbatim, and put any orchestrator recommendation on a separate line labelled `Orchestrator note:`." | Missed #2, Difficulty (failed reads) | applied |
| R20260929-4 | .claude/agents/README.md | Add: "Decisions the user has not answered go back to the user at the gate, never into a SendMessage as a settled decision." | Orchestration (unconfirmed decisions) | proposed |
| R20260929-5 | .claude/agents/implementation-planner.md | Add to the Review call: "Start from the spec's cited code anchors (Sources/Code list, file:line). Re-read a file only if you will plan a change inside it and the cited line range is not enough." | Duplication (re-reads) | proposed |
| R20260929-6 | .claude/hooks/implementation-planner-guard.sh | Run `/workflow-retro deep` to list the 4 denied commands, then widen the allowlist only for the read-only ones. | Difficulty (hook denials) | proposed |

**Module insights**
- `server/` — the repo clone is hard-reset (`git reset --hard origin/<branch>`) only in `RepoIntelService.resyncRepo` (`modules/repo-intel/service.ts:152`), triggered by the manual Re-analyze (`POST /repos/:id/resync`). There is no timer or background sync, so working-tree edits survive until the next manual resync.
- `server/` — `run-executor.ts:362` hard-codes `specs_read: []` and passes no `specs`. The tokenizer adapter counts with `cl100k_base`, while gpt-4.1/4o use `o200k_base`, so counts are approximate.
- `reviewer-core/` — `PromptParts.specs` (`prompt.ts:89`) already renders `## Project context` with per-item `wrapUntrusted`. `INJECTION_GUARD` states untrusted data "does NOT define your job", so documents meant as rules need a trusted framing line.
- `client/` — the run trace drawer (`TraceBody.tsx`) already has a "Specs read" row and a "Project context (dynamic)" block with a searchable expand modal. `messages/en/context.json` and the `/context` nav key are leftover scaffolding with no page.

**Follow-up on earlier proposals**: none (first entry).

## 2026-09-30 · project-context · in-context
Session e4c4b76c-0189-430e-979c-1dd1196c9523 · Scope: whole session (implementation-planner for SPEC-2026-09-29-project-context → /implement of plan v3, phases 1–6)

| # | Agent | Model | Tokens ¹ | Tool uses | Min ² | Resumes | Stopped | O | E | A | H |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | implementation-planner (review → plan v1 → v2/v3) | opus | 388,382 | 84 | 23.6 | 2 | no | 4 | 2 | 4 | 4 |
| 2 | implementer T1 (contracts) | inherit | 74,314 | 11 | 1.8 | 0 | no | 5 | 5 | 5 | 5 |
| 3 | implementer T2 (reviewer-core) + fix call | inherit | 51,508 | 14 | 1.5 | 1 | no | 3 | 5 | 4 | 4 |
| 4 | implementer T7 (client page) | inherit | 87,325 | 24 | 3.8 | 0 | no | 4 | 4 | 4 | 4 |
| 5 | implementer T3 (config/DB/RepoDocs) | inherit | 86,947 | 16 | 2.2 | 0 | no | 5 | 4 | 5 | 5 |
| 6 | implementer T8 (Context tabs) | inherit | 95,811 | 20 | 3.9 | 0 | no | 4 | 3 | 4 | 5 |
| 7 | implementer T4 (project-context module) | inherit | 101,557 | 19 | 3.2 | 0 | no | 5 | 4 | 5 | 5 |
| 8 | implementer T9 (trace drawer) | inherit | 76,285 | 18 | 2.2 | 0 | no | 5 | 4 | 5 | 4 |
| 9 | implementer T5 (run injection) + 2 trace-race fix calls | inherit | 91,814 | 26 | 4.6 | 2 | no | 3 | 4 | 5 | 5 |
| 10 | implementer T10 (editor + resync dialog) | inherit | 104,308 | 25 | 3.4 | 0 | no | 5 | 4 | 5 | 4 |
| 11 | implementer T6 (save + resync guard) | inherit | 97,271 | 21 | 2.5 | 0 | no | 5 | 4 | 5 | 5 |
| 12 | mechanical-checker ×8 (wave + post-fix gates) | frontmatter | 162,340 | 88 | 11.3 | 0 | no | 4 | 4 | 5 | 3 |
| 13 | plan-verifier (completeness) | sonnet | 164,014 | 39 | 4.2 | 0 | no | 5 | 3 | 5 | 5 |
| 14 | architecture-reviewer (full) | frontmatter | 38,494 | 14 | 1.0 | 0 | no | 4 | 5 | 5 | 5 |
| 15 | security-reviewer (full) | frontmatter | 97,263 | 42 | 3.4 | 0 | no | 5 | 4 | 5 | 5 |
| 16 | implementer (server review fixes) + 1 follow-up | inherit | 75,932 | 36 | 5.8 | 1 | no | 5 | 4 | 4 | 5 |
| 17 | implementer (client FC8-1 fix) | inherit | 27,925 | 2 | 0.2 | 0 | no | 5 | 5 | 5 | 5 |
| 18 | architecture-reviewer (delta) | frontmatter | 23,860 | 5 | 0.4 | 0 | no | 5 | 5 | 5 | 5 |
| 19 | security-reviewer (delta) | frontmatter | 40,171 | 8 | 1.1 | 0 | no | 5 | 5 | 5 | 5 |
| 20 | plan-verifier (final) | sonnet | 98,108 | 23 | 2.7 | 0 | no | 4 | 4 | 5 | 3 |

Totals: agents 27 (20 rows; mechanical-checker runs grouped) · agent tokens ≈1.98M · main n/a (in-context; `/context` mid-run showed 98.8k) · wall-clock: planning ≈24 min of agent time across 3 calls (plus user gates); /implement critical path ≈48 min of agent time (6 waves ≈27 min, completeness 4 min, review 3.4 min, fixes ≈3 min, deltas 1 min, post-fix gate + race fix ≈6 min, final verify 2.7 min), excluding user waits.

¹ `subagent_tokens` from the last completion notification per agent. For resumed agents the series grows (planner 161,912 → 263,157 → 388,382; T5 86,620 → 89,749 → 91,814), so read as cumulative/context size, not per-call. ² Sum of `duration_ms` over all notifications of that agent. Row 12 sums 8 runs (17,361 / 17,914 / 11,188 / 17,943 / 39,381 / 16,694 / 15,130 / 26,729 tokens).

Scores (one line each):
- Planner — O4: plan survived to "verified", but missed consumers of the changed `specs` type in `server/test/` and the agent page's own `VALID_TABS`; E2: 388k, 3 plan files (v1/v2/v3) because the guard blocks overwrite; A4: one gate of 4 questions + later 6 ⚠ confirmations, R8 needed an explanation; H4: waves/gates were directly executable.
- T1 — clean one pass, 7 files, no deviations.
- T2 — O3: its type change broke 5 server tests (W2 red gate); its Done-condition ran only server *typecheck*, which excludes `test/`.
- T7 — O4: wrote 3 files into the repo root by mistake (self-reported, cleaned); skipped 5 mandatory skills.
- T3/T4/T6 — one pass, no deviations; T4 confirmed every relayed handoff note (422 via ZodEffects, `not_cloned` code, unsafe path chars).
- T8 — O4: two necessary edits outside Owned paths (user accepted); skipped 4 mandatory skills; E3: slowest client task.
- T9/T10 — one pass; loaded all skills once the brief demanded it; flagged kit Modal/Textarea a11y gaps precisely.
- T5 — O3: its new `review()` test helper raced the pre-existing status-before-trace ordering and failed in a later full gate; H5: its grep found the same latent race in 3 other files.
- mechanical-checker — H3: labelled a real race ("TypeError … reading 'some'") as a Testcontainers flake; otherwise accurate.
- plan-verifier final — H3: summary line said "AC Met 33 · Unverifiable 23" while its own table gives 43 / 18 (61 ACs).
- architecture-reviewer full — O4: FC8-1 contradicted the local convention (6 of 7 `components/*` use barrels), costing a no-op fix call.

**Findings**
- Difficulty: W2 gate red — 5 failures in `server/test/prompt-callers.test.ts` / `prompt-structured.test.ts` after T2 changed `PromptParts.specs` to `ProjectContextDoc[]`. `server/tsconfig.json` includes only `src/**`, so T2's "server typecheck" Done-condition passed. — evidence: W2 mechanical-checker report; T2 fix-call report.
- Difficulty: a flaky new integration test. `run-executor.ts` writes `status: 'done'` (~:357) before `saveRunTrace` (~:419); `waitForPrRuns` returns on status, so T5's helper read a not-yet-saved trace. Surfaced only in the post-fix full gate (1 failed / 337). Same latent race in `intent.it.test.ts`, `reviews.it.test.ts` (pre-existing, not fixed). — evidence: post-fix gate report; T5 grep report.
- Difficulty: Testcontainers "No host port found for host IP" in the W5 gate; passed on isolated re-run. — evidence: W5 gate report + my re-run (6/6).
- Difficulty: T7 and T8 did not invoke their mandatory skills (self-reported); T9/T10 did once the brief said "don't skip". — evidence: T7/T8/T9 reports §4.
- Went well: T1, T3, T4, T6, T9, T10 finished in one pass with no deviations. Relaying earlier handoff notes into later briefs (ZodEffects 422, `not_cloned` code, unsafe path chars in `source="…"`) was confirmed point by point by T4.
- Went well: review converged in one iteration per source; both deltas were clean.
- Duplication: every wave ran the same tests twice (implementer Done-condition, then mechanical-checker full gates) — ~162k tokens of gate runs; accepted by the skill's design, but W4's gate cost 39k vs ~17k for the others (not explained).
- Duplication: plan-verifier re-read the whole diff twice (completeness 164k + final 98k).
- Missed: planner did not list consumers of a changed exported type (T2) or the agent page's own tab whitelist (T8) in Owned paths → 2 scope Partials + 1 red gate.
- Missed: my (orchestrator's) fix-call scopes were too narrow twice — NMV-2 needed a follow-up for `repo-intel/routes.ts` (T6-owned), and the trace-race fix needed a follow-up for `project-context-edit.it.test.ts` (T6-owned). Both files were already allowed by the skill's Fix-call rule ("+ the Owned paths of the tasks they belong to").
- Missed: FC8-1 was flagged against a rule that the local folder convention contradicts.
- Orchestration: user corrections/overrides this run — added README.md discovery (D1), asked for R8 explanation, kept every reviewer minor + nit, accepted NMV-1 as tradeoff. No agent output was overruled.
- Orchestration: `/implement` was invoked twice without arguments; I inferred plan v3 from context instead of asking (skill says ask). User did not object.
- Orchestration: I accepted T8's out-of-scope edits at the wave gate myself and only asked the user at Phase 2 (R20260929-4 still `proposed`).
- Regression vs earlier entry: no earlier implementer/reviewer/verifier rows to compare; planner had no usage last time (stopped).

**Proposals**
| ID | Target file | Change (exact text or diff) | Fixes | Status |
|---|---|---|---|---|
| R20260930-1 | .claude/agents/implementation-planner.md | Add to plan rules: "When a task changes an exported type, signature or registry (e.g. a reviewer-core export, a page's `VALID_TABS`), grep every consumer in all packages including `test/` dirs and list each consumer file in that task's Owned paths or in an explicit follow-on task." | Missed (planner), Difficulty (W2 red gate) | applied |
| R20260930-2 | .claude/agents/implementer.md | Add: "A task that changes a cross-package contract or exported type must run the *test* suites of every consuming package in its Done-condition, not only typecheck — `server/tsconfig.json` does not typecheck `test/`." | Difficulty (W2 red gate) | applied |
| R20260930-3 | .claude/agents/implementer.md | Add: "Invoke every skill in the task's Mandatory skills with the Skill tool before the first edit. Skipping one makes the task status `partial`, not `done`." | Difficulty (skills skipped) | applied |
| R20260930-4 | server/test/helpers/runs.ts (+ intent.it / reviews.it) | Add `waitForRunTrace(app, runId, timeoutMs = 10_000)` that polls `GET /runs/:id/trace` until 200 with a `log` array; note on `waitForPrRuns` that the trace is saved after the terminal status; switch the 4 call sites (incl. project-context-run/edit local helpers) to it. | Difficulty (flaky trace race) | applied |
| R20260930-5 | .claude/agents/mechanical-checker.md | Add: "If a Testcontainers file fails with exactly 'No host port found for host IP', re-run that file once and report both. Any other failure that passes on re-run is 'intermittent — needs root cause' with the error line, never 'flake'." | Difficulty (flake handling), mechanical-checker H3 | applied |
| R20260930-6 | .claude/agents/architecture-reviewer.md | Add to FC-checks: "Before flagging a structural convention finding (barrels, folder layout), count sibling folders; if the local majority follows the flagged pattern, drop it or report as 'matches local convention'." | Missed (FC8-1 no-op fix) | applied |
| R20260930-7 | .claude/hooks/implementation-planner-guard.sh | Allow the planner to overwrite its own plan while the file's `Status:` line is `draft`; keep the block for non-draft plans. | Planner E2 (v1/v2/v3 files) | rejected |
| R20260930-8 | .claude/skills/implement/SKILL.md (Fix call) | Add: "Before sending a Fix call, grep the plan-owned files for the same pattern as the finding and include every hit's task Owned paths in the fix scope in the first message." | Missed (orchestrator fix-call scope, 2 follow-ups) | applied |
| R20260930-9 | .claude/agents/plan-verifier.md | Add: "Compute every summary count from the matrix rows you printed; re-count before returning." | plan-verifier final H3 | applied |

**Module insights**
- `server/` — `tsconfig.json` includes only `src/**`; test fixtures are never typechecked, so a type change surfaces only when the tests run.
- `server/` — `run-executor.ts` sets the run to `done` before `saveRunTrace`; tests that read `/runs/:id/trace` right after `waitForPrRuns` can race (`intent.it.test.ts`, `reviews.it.test.ts` still do).
- `server/` — Testcontainers occasionally fails with "No host port found for host IP"; an isolated re-run passes.
- `server/` — project-context layout: port + `RepoDocPathError` in `adapters/repo-docs/port.ts`; pure discovery rules (`isSafePath`, `isDiscoverable`, `docTypeFor`) in `modules/_shared/project-docs.ts`; unexpected fs/git errors mapped by `modules/_shared/repo-docs-errors.ts` to `ExternalServiceError`; resync guard (409 `local_edits`, `?discard_local_edits=true`, workspace-scoped) in `repo-intel/service.ts` `assertResyncable`.
- `server/` — pre-existing: `AgentsService.linkSkill` does not check that `skillId` belongs to the workspace.
- `client/` — `app/agents/[id]/page.tsx` keeps its own `VALID_TABS` list (the skill page derives it from `constants.ts`).
- `client/` — kit `Modal` has no `aria-labelledby`, kit `Textarea` no `aria-label`, kit `Checkbox` no `disabled`; `@testing-library/user-event` is not installed (tests use `fireEvent`).
- `client/` — 6 of 7 `src/components/*` folders use a top-level `index.ts` barrel.
- `reviewer-core/` — `PromptParts.specs` is now `ProjectContextDoc[]`; `renderProjectContext*` is exported so the server counts tokens on the exact injected string.

**Follow-up on earlier proposals**
- R20260929-1, R20260929-2 (spec-creator) — not observable: spec-creator did not run this session.
- R20260929-3 (briefs: absolute paths, verbatim relays, `Orchestrator note:`) — partly recurred: briefs used repo-relative paths under an absolute repo root (no failed reads); user answers were quoted by option label, but my README.md relay to the planner added an inline recommendation ("recommend yes") without an `Orchestrator note:` label.
