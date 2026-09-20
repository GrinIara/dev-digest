# client — agent map

## Session protocol
Before working in this module, read `Insights.md`. When a session surfaces a substantial, non-obvious finding, use the `engineering-insights` skill to append it (skip if nothing new).

## Stack
Next.js 15 (App Router) · React 19 · TanStack Query · next-intl · Tailwind 4 ·
recharts · mermaid · react-markdown. TypeScript 5.7.

## Commands
- `pnpm dev` — web app on :3000
- `pnpm test` — vitest + jsdom, `fetch` mocked; no API or browser needed
- `pnpm typecheck` / `pnpm build` / `pnpm lint`

## Map
- `src/app/**/page.tsx` — routes (App Router); pages are thin
- `src/app/**/_components/<Name>/` — colocated feature logic, each with its own `*.test.tsx`
- `src/components/` — cross-cutting chrome (app-shell nav/breadcrumbs, diff-viewer, mermaid-diagram, page-shell)
- `src/lib/api.ts` — the one fetch base; `src/lib/hooks/*` — every TanStack Query data hook
- `src/vendor/ui` — vendored UI primitives (`@devdigest/ui`); `src/vendor/shared` — `@devdigest/shared` Zod contracts (mirrors server's copy)
- `messages/<locale>/*.json` — next-intl translations

## Conventions (non-default)
- Never `fetch` directly in a component — go through a hook in `src/lib/hooks/*`, which calls `src/lib/api.ts`.
- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`); don't hardcode the API origin elsewhere.
- Pages stay thin; put feature logic in a colocated `_components/<Name>/` folder next to the route that uses it.

## Naming conventions
- Route folders: kebab-case for static segments, camelCase inside brackets for dynamic segments (`src/app/repos/[repoId]/pulls/[number]/`, `src/app/agents/[id]/`) — no kebab-case dynamic segment exists anywhere.
- Feature-colocated components (`_components/`): PascalCase folder name matching the PascalCase file inside, usually with a barrel `index.ts` (`_components/AgentCard/AgentCard.tsx` + `AgentCard/index.ts`), and often `constants.ts`/`helpers.ts`/`styles.ts` siblings.
- Cross-cutting components (`src/components/`): the opposite pairing — kebab-case *folder*, PascalCase *file* inside (`src/components/app-shell/AppShell.tsx`, `src/components/diff-viewer/DiffViewer/`).
- Hooks: domain/API hooks are `useX` *functions* inside domain-named *files* under `src/lib/hooks/` (`hooks/reviews.ts` exports `usePrReviews`, `useFindingAction`, etc.) — the file isn't `use*`-named, the export is. UI-behavior hooks colocated with a component use `use*`-named *files* instead, under a local `hooks/` folder (`src/components/app-shell/hooks/useGlobalShortcuts.ts`).
- Styles: a colocated `styles.ts` exports one `const s = {...}` object of camelCase keys (some as functions taking state like hover), typed `CSSProperties` — consumed as `style={s.pageHeader}`.
- Tests: `*.test.tsx` colocated directly beside the component it tests, same folder — not in a separate `__tests__/` tree.

## Gotchas
- `*.test.tsx` mocks `fetch` and never talks to a real API or browser — real user journeys are covered only by `../e2e`, not here.
- `src/vendor/ui` and `src/vendor/shared` are vendored copies, not npm packages — editing them only affects this package; `shared` must stay in sync with `server/src/vendor/shared`.

## Do not touch
- `src/vendor/shared` — mirrors `server/src/vendor/shared`; don't fork it independently, update both together.
- `pnpm-lock.yaml` — regenerate via `pnpm install`, never hand-edit.

## Read When
- Usage & UI route map → [README.md](README.md)
- Deciding where server vs. client logic belongs → `docs/ui-architecture.md`
- Adding/changing a route or its data → `specs/pages.md`
- Decisions & gotchas log → `Insights.md`
