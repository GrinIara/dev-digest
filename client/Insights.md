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

## 2026-09-18 — [Mistake] Two independent unused scaffolds for the same "findings by severity" shape used different casing
While building the PR-list FINDINGS column, found `client/src/lib/types.ts:38-48`'s unused `PrRowView.findings: {CRITICAL,WARNING,SUGGESTION}` (uppercase) — a leftover scaffold never wired to any component. Server-side, `server/src/modules/pulls/status.ts` had its own unused scaffold, `rollupSeverities`, returning lowercase `{critical,warning,suggestion}` (see server `Insights.md`). Two different people/sessions apparently pre-built the same concept with inconsistent casing and neither got wired up. Went with uppercase for the real `PrMeta.findings` wire field since it matches the live, load-bearing convention (`Severity` enum values, `FindingRecord.severity`, `SeverityBadge`/`SEV` map in `@devdigest/ui`) — lowercase was the outlier. If you find another unused "scaffold" type in this codebase, check its key casing against `Severity` before trusting it as the contract shape.

## 2026-09-18 — [Context] `@devdigest/ui` never imports `@devdigest/shared` — new UI components take their own minimal prop types
`client/src/vendor/ui` (the design-system package) has zero dependency on `@devdigest/shared`'s contract types anywhere — e.g. `SeverityBadge` (`vendor/ui/primitives/Badge.tsx:52`) takes its own local `Severity` type from `vendor/ui/primitives/tokens.ts:3`, not the shared `Severity` Zod enum; feature code casts at the boundary (`FindingCard.tsx` does `f.severity as Severity`). Followed this when adding `FindingsHoverPopover` (`vendor/ui/kit/FindingsHoverPopover.tsx`): it takes a local `FindingPreview` interface (severity/title/category/file/start_line/confidence/rationale) instead of importing `FindingRecord`, and callers (`PRRow.tsx`, `RunHistory.tsx`) explicitly map `FindingRecord[]` → `FindingPreview[]` at the call site. Don't import `@devdigest/shared` into `vendor/ui` even when the shapes are identical — it's a deliberate architectural boundary (design system has no API-contract dependency).

## 2026-09-18 — [Pattern] Timeline run tiles get their per-run findings by cross-referencing the sibling Review-runs fetch, not a new request
`RunHistory.tsx`'s Timeline only receives `RunSummary[]` (from `usePrRuns` → `GET /pulls/:id/runs`), which carries just a total `findings_count`, no per-severity breakdown or the findings themselves. The Review-runs section on the same tab already fetches `ReviewRecord[]` (each with `run_id` + a full `findings` array) for the very same page. Added a `findingsByRunId: Map<run_id, FindingRecord[]>` built in `FindingsTab.tsx` from that already-fetched `reviews` array, passed down into `RunHistory` as a prop — gives the Timeline severity icons + a hover popover with zero new network requests. When a component on this tab seems to be missing data, check whether a sibling component on the same tab already fetched it before adding a new hook/endpoint.

## 2026-09-19 — [Context] Follow-up citation: exact file:line for the 2026-09-18 "No shared number-formatting util" entry
`formatTokens` is `.../RunTraceDrawer/helpers.ts:26`; the two colocated `formatCost` implementations are `.../RunTraceDrawer/helpers.ts:32` and `src/app/repos/[repoId]/pulls/helpers.ts:12`.

## 2026-09-19 — [Context] Follow-up citation: exact file:line for the 2026-09-18 "Timeline run tiles… cross-referencing" entry
`findingsByRunId` is built in `.../FindingsTab/FindingsTab.tsx:78` and passed to `RunHistory` at `FindingsTab.tsx:146`. `RunHistory.tsx` declares the prop at `RunHistory.tsx:119` and reads it per-run at `RunHistory.tsx:176` (`findingsByRunId?.get(r.run_id) ?? []`).
