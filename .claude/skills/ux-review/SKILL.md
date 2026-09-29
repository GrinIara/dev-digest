---
name: ux-review
description: "Reviewing a UI design or UX description for gaps and improvements before it becomes a spec: Nielsen's 10 usability heuristics applied to DevDigest, a screen-state checklist (empty, loading, partial, error, success, disabled, stale), long-running and async work (review runs, indexing, SSE), destructive and repeated actions, forms, and a WCAG 2.2 AA minimum. Outputs findings as concrete proposals that can become EARS acceptance criteria. Use when analysing Figma frames, screenshots, a text description of a screen or an existing page for a spec, or when asked for UX improvements or a UX review of a design. Does NOT cover component structure or React implementation (see frontend-ui-architecture, react-best-practices). Trigger terms: UX review, usability, heuristics, empty state, loading state, error state, accessibility, WCAG, design review, Figma."
---

# UX review for specs

The goal is **what the user experiences**, not how it's built. Every finding ends as a proposal the user can accept (→ an AC or edge case), reject (→ Non-goal) or defer (→ Open question).

## 1. Walk the flow first

Before judging screens, write the user's path in one line per step: entry point → action → system response → next step → exit. For each step ask: *what does the user know here, what can they do, what happens if it goes wrong?* Most gaps show up as a missing step (no way back, no confirmation, no result screen).

## 2. Screen-state checklist

For every screen or component that shows data, check that the design defines each state. A missing one is a **gap**.

| State | Question | DevDigest example |
|---|---|---|
| Empty (first use) | What does a new user see, and what's the next action? | No repositories connected yet |
| Empty (no results) | Is "nothing" distinguishable from "not loaded" and from "error"? | PR reviewed, zero findings |
| Loading | Skeleton or spinner? Does the layout jump? | Loading PR diff |
| Long-running | Progress, what's happening now, can I leave and come back? | Review run, repo indexing |
| Partial | Some data arrived, some failed — what's shown? | 2 of 3 agents finished, 1 failed |
| Error | What failed, in user terms, and the recovery action | GitHub token revoked → "Reconnect GitHub" |
| Stale | Is the data older than reality, and does the user know? | New commits pushed after the review |
| Disabled | Why can't I click it? | "Run review" while a run is in progress |
| Success | Confirmation, and what next? | Findings posted |
| Overflow | Very long names, 1000 items, huge diff, unicode | 5 000-line diff, long file paths |

## 3. Heuristics (Nielsen), applied

1. **Visibility of system status** — every async action gives feedback within ~1 s; long work shows progress and survives reload (SSE reconnect).
2. **Match with the real world** — GitHub's words (PR, commit, branch), not internal ones (run id, agent_runs).
3. **User control and freedom** — cancel a running review, undo or confirm destructive actions, a clear way back.
4. **Consistency and standards** — same action, same name and place across pages; severity colours/labels consistent.
5. **Error prevention** — disable double submit, confirm irreversible actions, validate before sending.
6. **Recognition rather than recall** — show which agents, which commit, which settings a result came from.
7. **Flexibility and efficiency** — sensible defaults, keyboard shortcuts for repeat actions, deep links to a finding.
8. **Aesthetic and minimalist design** — the primary action is obvious; secondary details collapsed.
9. **Help users recover from errors** — plain message + cause + next action; never a raw stack trace or status code alone.
10. **Help and documentation** — inline hints where a concept is new (blast radius, grounding).

## 4. Async, repeated and destructive actions

- **Double submit / two tabs** — what happens if the same action is triggered twice?
- **Leave and return** — navigating away mid-run: does the run continue, and how does the user find it again?
- **Retry** — is it offered, is it safe (idempotent), is there a limit?
- **Cost** — actions that spend LLM money or API quota say so before running.
- **Destructive** — delete / overwrite / reset need confirmation naming the object, or an undo.

## 5. Forms and input

Labels (not placeholder-only), inline validation with the rule stated, preserved input on error, sensible defaults, required vs optional marked, limits shown before the user hits them.

## 6. Accessibility minimum (WCAG 2.2 AA)

- Everything reachable and operable by keyboard; visible focus; focus not hidden by sticky headers (2.4.11).
- Contrast ≥ 4.5:1 text, ≥ 3:1 UI components and severity indicators; never colour alone for severity or status.
- Async status changes announced (`aria-live` region for "Review finished", errors).
- Target size ≥ 24×24 px (2.5.8); no drag-only interactions (2.5.7).
- Error messages identify the field and the fix (3.3.1, 3.3.3).

## 7. Output format

One row per finding — the caller maps it into the spec:

| # | Finding | Kind (gap / corner case / improvement) | Heuristic or checklist item | Proposal (observable behaviour) | Suggested decision |
|---|---|---|---|---|---|
| UX-1 | No state for a run where one agent failed | gap | Partial state | Show finished agents' findings plus "Agent X failed — Retry" | accept → AC |

Proposals describe behaviour ("the UI shows …"), never components or code. Mark each as **needed** (the flow breaks without it) or **nice-to-have** (the user decides) — don't present nice-to-haves as requirements.
