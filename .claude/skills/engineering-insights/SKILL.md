---
name: engineering-insights
description: "Reads and appends to a module's Insights.md (client/, server/, reviewer-core/, e2e/) to carry engineering knowledge across sessions. Use IMMEDIATELY whenever the user asks to record, remember, write down or 'save so we don't hit it again' a finding they just made (a root-caused bug, a library quirk, a gotcha) — even mid-session, and before investigating the code further. Also used at the start of a task to read the relevant module's Insights.md before making changes, and at the end of a substantial session to record a new finding (root-caused bug, abandoned approach, user correction, tool/library quirk, discovered convention). Skipped when the user only asks for an explanation, after short or routine sessions, or when the finding is generic knowledge, a one-off transient issue, or already recorded. Trigger terms: record this, remember this, write it down, зафіксувати, запам'ятати, щоб не наступати, insights, learnings, wrap-up, retro, retrospective, gotcha, lessons learned, session notes, Insights.md."
---

# Engineering Insights

## Before work

Before starting work in a module, read its `Insights.md` (`client/`, `server/`, `reviewer-core/`, `e2e/`) in full.

## Drafting an entry

At the end of a **substantial** session — a bug root-caused, an approach tried and abandoned, a user correction, an unexpected tool/library behavior, or a project convention discovered — draft one entry per finding. Skip this entirely after a short or routine session.

- **Category**: Pattern (what worked) / Mistake (what didn't, and why) / Decision (with rationale) / Context (codebase or tool/library quirk).
- **Concrete, not generic**: name the actual file/function/library and the *why*. State it positively ("use X because Y"), not as a bare warning ("be careful with X"). If it'd be obvious to anyone reading the code, don't write it.
- **Evidence only, never invented**: every claim in the entry must come from this session — a `file:line` you actually read, a command output you actually saw, or a fact the user stated. Don't fill gaps with plausible numbers, versions or mechanisms (e.g. "1536D → 384D", "the index was built for the old size") you did not verify. If the user reports a finding without evidence, record only what they said, attributed to them, and mark what is unverified — or ask for the evidence first. `Insights.md` is read as fact by every later session; an invented detail here becomes a hallucination everywhere.

## Writing it down

Read `Insights.md` again right before writing: skip if the same lesson already exists in any wording, or extend the existing entry instead of adding a near-duplicate.

**Report what actually happened**: tell the user the entry is recorded only after your own Write/Edit to `Insights.md` succeeded in this session. If the write fails, is denied, or was never attempted (e.g. you are still waiting for evidence), say so plainly — never report the entry as recorded, and never quote an entry as "saved" that is not in the file.

**Append-only, always**: add the new entry at the end of the file. Never overwrite, reorder, or delete anything already in `Insights.md` — not existing entries, not the header. To correct a past entry, add a new dated note referencing it instead of editing it in place.

Format each entry as `## YYYY-MM-DD — [Category] short title` + one concise paragraph with concrete `file:line` evidence. If an entry becomes load-bearing enough that every session needs it, promote it into that module's `CLAUDE.md` instead (without removing it here). Past ~150 entries, move — don't delete — older/superseded ones into `Insights-archive.md`.
