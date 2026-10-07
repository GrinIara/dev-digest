---
name: ears-requirements
description: "Writing and checking testable requirements with EARS (Easy Approach to Requirements Syntax): the five patterns (ubiquitous, event-driven WHEN, state-driven WHILE, unwanted behaviour IF…THEN, optional feature WHERE) and their combinations, turning vague wording into thresholds and deterministic rules, one behaviour per criterion, AC-N numbering with traceability to user stories and a Verify level (unit / integration / e2e / manual). Use when writing or reviewing acceptance criteria in a spec (specs/, <package>/specs/ SPEC-*.md), when checking whether plan requirements are measurable, or when asked to make a requirement testable. Trigger terms: EARS, acceptance criteria, AC-N, shall, WHEN/WHILE/IF/WHERE, testable requirement, vague requirement, spec."
---

# EARS requirements

EARS (Mavin, Wilkinson, Harwood, Novak — Rolls-Royce, IEEE RE'09) separates the **condition** from the **system response**, so each requirement reads the same way and can be checked by an observer. In DevDigest specs it is the only allowed form for `## Acceptance criteria (EARS)`.

## The five patterns

| Pattern | Template | Use for | DevDigest example |
|---|---|---|---|
| Ubiquitous | `The <actor> shall <response>.` | Always true, no trigger | `The API shall scope every query to the caller's workspace.` |
| Event-driven | `WHEN <trigger>, the <actor> shall <response>.` | A reaction to a discrete event | `WHEN the user clicks "Run review", the UI shall show the run as queued within 1 s.` |
| State-driven | `WHILE <state>, the <actor> shall <response>.` | Behaviour for the whole duration of a state | `WHILE a review run is in progress, the UI shall disable "Run review" for that PR.` |
| Unwanted behaviour | `IF <unwanted condition>, THEN the <actor> shall <response>.` | Failures, invalid input, abuse | `IF the LLM response fails schema validation, THEN the reviewer shall retry once and then mark the run failed with reason "invalid_model_output".` |
| Optional feature | `WHERE <feature is enabled>, the <actor> shall <response>.` | Behaviour behind a flag, setting or plan | `WHERE REPO_INTEL_ENABLED is set, the reviewer shall include the callers digest in the prompt.` |

Combinations are allowed in a fixed order — `WHERE … WHILE … WHEN/IF …, the <actor> shall …` — e.g. `WHILE the repository is being indexed, WHEN the user opens Blast radius, the UI shall show "Indexing…" instead of an empty list.` If a combination needs more than two clauses, split it into two criteria.

Rules:

- Triggers in capitals (`WHEN`, `WHILE`, `IF … THEN`, `WHERE`) and always `shall` — `should`/`may`/`will` are not requirements.
- **Name the actor**: UI, API, reviewer, MCP server, worker. "The system" only when the actor genuinely doesn't matter.
- **One observable response per criterion.** A second "and" in the response usually means a second AC.
- The response is something an observer can see: a UI state, an HTTP status and body, a row, an event, a log line, a number. Not an internal intention ("shall try to", "shall handle").
- A negative requirement needs a trigger or a scope: `IF the token is revoked, THEN the API shall not call GitHub again for that repository until it is reconnected.` — not `shall never fail`.

## Vague → testable

| Vague | Testable |
|---|---|
| "Should work fine on large repositories" | `WHEN the repository exceeds the indexing threshold, the system shall build the overview from deterministic facts only, without reading every file in full.` |
| "Must not break when the model is unavailable" | `IF the structured model call fails, THEN the system shall show the deterministic overview with the degradation reason.` |
| "Should suggest where to start reading" | `The system shall order the reading path by file rank in the import graph.` |
| "Review should be fast" | `WHEN a review run starts, the UI shall show its status within 1 s and the first findings for a PR of ≤ 400 changed lines within <N> s.` |
| "Handle errors gracefully" | `IF the GitHub API returns 401 for the repository token, THEN the UI shall show "Reconnect GitHub" and shall not retry automatically.` |
| "Show a nice empty state" | `WHEN a PR has no findings, the UI shall show "No issues found" with the agent names that ran.` |

When a number is missing (`<N>`), don't invent it: take a default, mark it `[NEEDS CLARIFICATION: OQ-N]`, and ask.

**Red flags** — rewrite when you see: "and/or", "etc.", "as appropriate", "if possible", "user-friendly", "intuitive", "quickly", "robust", "seamless", "support X" (support how?), passive voice with no actor, "all"/"any" without a bound, a response that is an implementation step ("shall call `foo()`", "shall add a column").

## Numbering, traceability, verification

Format used in DevDigest specs:

```
AC-3 (US-1): WHEN …, the UI shall …. · Verify: e2e — observable: <what a checker sees>
AC-4 [Could] (US-1): WHERE …, the API shall …. · Verify: integration — observable: <what a checker sees>
```

- `AC-N` numbers are **stable**: once a draft has been shared, never renumber. A dropped criterion stays as `AC-4 — removed (<reason>)`, so plans and tests that cite it don't silently point at a different requirement.
- Every AC cites at least one user story; every user story has at least one AC.
- An AC inherits its story's priority; write `[Should]`/`[Could]` only when it is lower.
- `Verify:` names the **level** of check, not a file or tool:
  - `unit` — pure logic inside one module (a rule, a threshold, a mapping);
  - `integration` — API + DB, or two modules talking (route → service → repository, server → reviewer-core);
  - `e2e` — a user-visible flow through the UI;
  - `manual` — only when automation is impractical (visual judgement, third-party UI); add a few words saying why.
- `— observable:` follows the level and says what a checker sees when the AC holds: a UI text or state, an HTTP status + response field, a persisted value read back through the API, an emitted event, a log line. Externally visible only — no function or table names. One line. If you can't name one, the AC isn't testable yet.
  - ✗ `Verify: integration`
  - ✓ `Verify: integration — observable: POST /reviews/:id/rerun returns 202 and GET /reviews/:id shows status "queued"`

## Checklist

- [ ] Every AC matches one of the five patterns (or an allowed combination) and uses `shall`.
- [ ] Actor named; one observable response; no red-flag wording.
- [ ] Numbers, limits and messages are concrete, or marked `[NEEDS CLARIFICATION: OQ-N]`.
- [ ] Every unwanted condition you can think of for an event-driven AC has its own `IF … THEN` AC or an edge-case entry pointing to one.
- [ ] Traceability: each AC → US, each US → ≥1 AC; `Verify: <level> — observable: …` present.
- [ ] No implementation: no file, function, table or library names in the response.
