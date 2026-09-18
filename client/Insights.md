# client — Insights

Append-only log of gotchas and non-obvious decisions discovered *after* the
fact — not upfront design. If an entry becomes load-bearing enough that every
session needs it, promote it into `CLAUDE.md` instead. Don't duplicate an
existing entry, even reworded — extend it instead. Past ~150 entries, move
older/superseded ones into `Insights-archive.md`.

Format:

## YYYY-MM-DD — [Category] short title
What happened, what was decided, why. (Category: Pattern, Mistake, Decision, or Context.)

## 2026-09-18 — [Pattern] No shared number-formatting util — colocate formatters per feature folder, even if similar
`client/src/lib` has no `format.ts`; formatting helpers live colocated in each feature folder's own `helpers.ts`. Precedent: `RunTraceDrawer/helpers.ts`'s `formatTokens` already renders tokens differently ("12k→1.5k") than the PR-list area does. When the "agent run cost" feature needed a `formatCost` in both `pulls/helpers.ts` (list column, timeline) and `RunTraceDrawer/helpers.ts` (stats tile), that precedent was followed by writing `formatCost` twice, colocated, rather than introducing a new shared module — matches the existing convention of "colocated feature logic" over premature cross-cutting abstraction.
