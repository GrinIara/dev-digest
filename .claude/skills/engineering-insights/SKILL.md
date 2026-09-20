---
name: engineering-insights
description: "Reads and appends to a module's Insights.md (client/, server/, reviewer-core/, e2e/) to carry engineering knowledge across sessions. Used at the start of a task to read the relevant module's Insights.md before making changes, and at the end of a substantial session to record a new finding: a bug root-caused, an approach tried and abandoned, a user correction, an unexpected tool/library behavior, or a project convention discovered along the way. Skipped after short or routine sessions, or when the finding is generic knowledge, a one-off transient issue, or already recorded. Trigger terms: insights, learnings, wrap-up, retro, retrospective, gotcha, lessons learned, session notes, Insights.md."
---

# Engineering Insights

Before starting work in a module, read its `Insights.md` (`client/`, `server/`, `reviewer-core/`, `e2e/`) in full.

At the end of a **substantial** session — a bug root-caused, an approach tried and abandoned, a user correction, an unexpected tool/library behavior, or a project convention discovered — draft one entry per finding. Skip this entirely after a short or routine session.

- **Category**: Pattern (what worked) / Mistake (what didn't, and why) / Decision (with rationale) / Context (codebase or tool/library quirk).
- **Concrete, not generic**: name the actual file/function/library and the *why*. State it positively ("use X because Y"), not as a bare warning ("be careful with X"). If it'd be obvious to anyone reading the code, don't write it.

Read `Insights.md` again right before writing: skip if the same lesson already exists in any wording, or extend the existing entry instead of adding a near-duplicate.

**Append-only, always**: add the new entry at the end of the file. Never overwrite, reorder, or delete anything already in `Insights.md` — not existing entries, not the header. To correct a past entry, add a new dated note referencing it instead of editing it in place.

Format each entry as `## YYYY-MM-DD — [Category] short title` + one concise paragraph with concrete `file:line` evidence. If an entry becomes load-bearing enough that every session needs it, promote it into that module's `CLAUDE.md` instead (without removing it here). Past ~150 entries, move — don't delete — older/superseded ones into `Insights-archive.md`.
