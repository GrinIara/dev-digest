# 0001 — Docs taxonomy: Diátaxis-lite + ADRs

- Status: accepted
- Date: 2026-09-23

## Context and problem

Documentation is spread across root `docs/` (agent prompts, an architecture review, a feature spec) and each package's `docs/` and `specs/` folders, which `AGENTS.md` "Read When" sections already point to. The new `doc-writer` agent needs a documented target so it knows where each page belongs, and design decisions currently have no home. Origin: [`docs/plans/2026-09-23-subagents-test-arch-verify-doc.md`](../plans/2026-09-23-subagents-test-arch-verify-doc.md) (task T8).

## Considered options

1. **Status quo** — ad-hoc root docs, no stated taxonomy.
2. **Full Diátaxis tree at the root** — `docs/{tutorials,how-to,reference,explanation}/`, moving package `docs/` and `specs/` into it.
3. **Diátaxis-lite + ADRs** — keep package `docs/` (explanation) and `specs/` (reference), add root `docs/how-to/`, `docs/reference/`, `docs/explanation/` for cross-package pages as they arrive, and `docs/adr/` in MADR format.

## Decision outcome

Chosen: option 3. It gives every page type a home without moving files that `CLAUDE.md` and the package `AGENTS.md` files link to, and adds decision records.

## Consequences

- Good: `doc-writer`'s write paths (`.claude/hooks/doc-writer-guard.sh`) match the taxonomy exactly; no links break; decisions become reviewable records.
- Good: C4-style views are drawn as plain Mermaid flowcharts, which GitHub renders (it doesn't render Mermaid's C4 extension).
- Bad: two levels (root vs package) to choose between; the table in [`docs/README.md`](../README.md) is the tie-breaker.
- Bad: the index can go stale; every new page must be linked from an index.
