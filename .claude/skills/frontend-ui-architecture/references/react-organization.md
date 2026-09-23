# React Organization — Reference

Framework-agnostic React organization guidance. For Next.js App Router-specific structure, see [nextjs-architecture.md](./nextjs-architecture.md). Sources cited inline by short name; full bibliography in [../README.md](../README.md).

## Table of contents
1. [Folder structure](#1-folder-structure)
2. [Component decomposition](#2-component-decomposition)
3. [Constants](#3-constants)
4. [Utils vs. hooks vs. services](#4-utils-vs-hooks-vs-services)
5. [Business logic & state coordination](#5-business-logic--state-coordination)
6. [Barrels, naming, import boundaries](#6-barrels-naming-import-boundaries)

## 1. Folder structure

**The unifying rule** (Wieruch, Kent C. Dodds "Colocation," Bulletproof React): code lives inside the component/feature that uses it until a **second** consumer needs it, then it's promoted to a shared layer. This applies identically to components, hooks, utils, and constants — it's one rule, not four.

**The live disagreement — feature-based vs. function-based top level:**

| | Feature-based | Function-based |
|---|---|---|
| Sources | Bulletproof React, Feature-Sliced Design, Wieruch, "Screaming Architecture" | Josh W. Comeau |
| Top level looks like | `features/orders/`, `features/users/` | `components/`, `hooks/`, `lib/`/`helpers/` |
| Argument for | Self-documenting (reveals what the *product* does, not that it's "a React app"); isolates change; scales to monorepo/multi-app | Real product features drift and re-segment constantly — a folder structure that encodes today's feature boundaries becomes stale scaffolding |
| Enforcement | Bulletproof React: hard rule that features must not import each other; cross-feature composition happens at the app/page level, enforced via `eslint-plugin-boundaries` | No equivalent enforcement needed — flat technical folders don't create false boundaries to violate |

**This codebase (`client/src`) already follows function-based**: `app/`, `components/`, `lib/`, `lib/hooks/`, `i18n/`, `test/` — no `features/` directory. Default to extending that pattern (new shared component → `src/components/`, new shared hook → `src/lib/hooks/`, new non-React logic → `src/lib/`) rather than introducing feature folders unilaterally.

**When to escalate** (Wieruch's 5-step progression, and Bulletproof React's own scoping note): move to feature folders only when a technical folder (e.g. `components/`) becomes genuinely hard to navigate, or when a piece of the app needs to become its own deployable unit/package. Don't do it preemptively for an app this size — that's designing for a hypothetical.

**Next.js-specific note**: colocating non-route files inside `app/` is *safe by default* because only `page`/`route` files are ever routable — this guarantee doesn't exist in a router-less SPA, so private-folder (`_folder`) conventions from Next.js don't transfer 1:1 to non-Next React apps. See [nextjs-architecture.md](./nextjs-architecture.md).

## 2. Component decomposition

**react.dev's three lenses** for where a component boundary should fall: does it do one thing (separation of concerns)? would it be its own CSS selector? how are design layers organized in the mockup? Well-structured data models tend to map onto component structure naturally.

**Is this even state?** (react.dev's three-question test) — if a value stays unchanged over time, is passed in via props, or can be computed from existing state/props, it is **not** state. Compute it inline instead of storing+syncing it. This is the single most-repeated anti-pattern warning across React sources and is the root cause of most "why is my component so complicated" problems.

**Concrete smells that mean "split this component"** (Alex Kondov — chosen over a fixed line-count because it's testable against the actual code, not an arbitrary number):
- Multiple unrelated `useState` calls doing unrelated jobs
- Large/branchy conditional JSX
- A function that doesn't touch component state/props living inside the component body
- Dead code, unused imports, functions mixing fetching + formatting + side effects

**Extraction order** (do in this order, don't jump to step 3):
1. Data-fetching/stateful logic → custom hook
2. Pure functions not touching state → standalone utils
3. Distinct JSX regions → child components (unify near-duplicate markup rather than splitting it into near-identical siblings)
4. Inline `.map()`/render-function bodies → dedicated components

**Container/presentational pattern — history, not current default.** Dan Abramov created this split in 2015 (presentational = markup/props only; container = state/fetching/wiring) and **explicitly reversed his own recommendation in 2019**: with hooks, a custom hook replaces what a container component used to do, without the extra wrapper layer. patterns.dev documents the same reversal, calling the pattern "overkill in smaller applications" today. If you see this pattern in older code (pre-2019, Redux `connect`-based), recognize it for what it is — don't propose it as the modern default.

**Hexagonal/ports-and-adapters framing** (Alex Kondov) — useful for a feature that's outgrowing simple hook+component:
- **Custom hooks = ports**: the boundary between business logic and UI, returning ready-to-render data/callbacks, hiding infrastructure.
- **Services/clients = adapters**: the only layer allowed to touch HTTP/sockets/DB, deliberately framework-agnostic.
- **Domain logic**: plain, framework-agnostic functions/objects (validation, mapping), callable from hooks but not dependent on them.
- Payoff: tests mock one hook instead of several services; internal refactors don't ripple into components.

## 3. Constants

| Need | Use | Why |
|---|---|---|
| Compile-time-only type safety; values never needed at runtime | Union of string literals | Zero runtime/bundle cost |
| Values needed at runtime (build a UI list, look up a display label); internal value ≠ display name | `const object` (`as const`) | No reverse-mapping code generated; supports computed/dynamic values |
| Publishing a library for external/cross-team consumption where nominal typing or reverse-mapping genuinely matters | `enum` | Rare in application code — default is "probably never" |

TypeScript's own team documented choosing string-literal unions over enums back in 2019 — this isn't a fringe opinion, it's an early precedent from the language's own React-adjacent tooling guidance. Enums generate real runtime code (reverse mappings) that shows up in bundle size for no benefit over a `const object` in normal app code.

Placement follows the same colocate-until-shared rule as everything else in section 1 — a constant used by one component lives next to it; once two features need it, promote it.

## 4. Utils vs. hooks vs. services

One axis, decided by what the code actually needs to run — not by folder habit:

| Question | If yes → | Reasoning |
|---|---|---|
| Needs React's render/effect/state rules? | Custom hook | Must run inside React's rules; the natural mockable seam for component tests |
| Pure, no React, no I/O, portable to any project unchanged? | Utility/helper | A "toolbox" function — no domain knowledge, reusable anywhere |
| Pure, no React, but encodes an actual business rule? | Domain logic | Still testable without component/network mocking; purity is what makes it cheap to test |
| Performs actual I/O (network/socket/storage)? | Service/client | The only layer that should touch infrastructure directly |

Prefer mocking a hook over mocking multiple raw service calls in tests — hooks are a more stable seam because they're the thing components actually depend on.

**Caveat**: a full dedicated domain layer (DTOs, mappers) is explicitly called overkill for apps that are thin CRUD wrappers around an API. Don't add one preemptively.

## 5. Business logic & state coordination

- Business logic never lives in the component body. Components render based on data and trigger events — nothing else.
- If the app needs client-side global state beyond React Query's server-state cache, there are two genuinely different, both-legitimate defaults:
  - **Single store with slices** (Redux Style Guide's "ducks" pattern via `createSlice`) — normalize relational state by ID, name slices by data type not component, prefix selectors with `select`.
  - **Multiple small independent stores** (Zustand community/TkDodo default) — only consolidate into one store when two pieces of state are genuinely interrelated (an action needs to update both); otherwise keep them separate. Never export the raw store — export hooks wrapping selectors/actions.
  - These reflect different philosophies about where the *coordination boundary* for state should sit — pick deliberately, don't default to whichever library you reach for first without considering which fits.
- Query/mutation logic (`@tanstack/react-query`): favor **vertical/feature colocation** of query hooks and keys over a horizontal `queries/`+`mutations/` split by type. Keep query functions/keys unexported inside the feature; only export the hook built on top of them.

## 6. Barrels, naming, import boundaries

**Barrel files (`index.ts` re-exports) — a real, unresolved disagreement:**
- **Against**: Bulletproof React and a measured 2026 deep-dive (one barrel-mediated import pulled in a 552 kB chunk that dropped to 64 kB once fixed) — bundlers can only tree-shake a module if dropping it is side-effect-free, and one side-effecting module in a barrel keeps the whole graph. Barrels also hurt **dev-mode** memory/`tsc` time regardless of production bundling, and are a common source of circular-dependency bugs.
- **For**: Josh Comeau deliberately uses and defends barrels for app-sized (non-library) code, calling the anti-barrel position "premature optimization."
- **Default for this codebase**: avoid barrels, given the measured cost and that none of the existing packages here currently rely on them as a public-API convention. Treat it as a deliberate team decision if that changes, not a default to drift into.

**Naming**: filename matches the default export (`RepoCard.tsx` → `RepoCard`); PascalCase for components, camelCase for hooks/utils/functions (`use-throttled-state.ts`, `github-urls.ts` — matches this repo's existing `src/lib/github-urls.ts` convention).

**Enforcing import direction**: once "shared code must not import from feature code" (or similar) actually matters, enforce it with `eslint-plugin-boundaries` (declare architectural elements + allowed dependency directions, real-time ESLint errors) or `dependency-cruiser` (analyzes the whole import graph, better suited to CI-level architecture fitness functions and visualizing violations); adopt incrementally (flag only new violations) rather than requiring full-codebase compliance on day one.
