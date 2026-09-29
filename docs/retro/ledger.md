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
