# e2e — Insights

Append-only log of gotchas and non-obvious decisions discovered *after* the
fact — not upfront design. If an entry becomes load-bearing enough that every
session needs it, promote it into `AGENTS.md` instead. Don't duplicate an
existing entry, even reworded — extend it instead. Past ~150 entries, move
older/superseded ones into `Insights-archive.md`.

Format:

## YYYY-MM-DD — [Category] short title
What happened, what was decided, why. (Category: Pattern, Mistake, Decision, or Context.)

## 2026-10-12 — [Context] The Files changed tab opens in Smart order with collapsed role groups, so no file path is on the page
Since the smart-diff grouping, `DiffTab` defaults to `order = "smart"` (`client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:50`) and renders `SmartDiffGroups` instead of the flat `DiffViewer` (`:141`). On the CI failure screenshot only a collapsed "Core" group was visible, so flow `05`'s `wait --text src/config.ts` timed out. The flow now clicks the "Original order" button first (`specs/05-pr-diff.flow.json:8`); with it `scripts/e2e.sh` passed 7/7 flows. A flow that asserts a file path or diff line on that tab must switch to Original order (or expand the right group) first.
