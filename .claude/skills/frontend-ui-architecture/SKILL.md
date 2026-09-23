---
name: frontend-ui-architecture
description: "React + Next.js code organization and architecture guidance: where new components/files should physically live, when and how to split a component, where constants belong, when to extract a util vs a hook vs a service, and where business logic belongs. Also covers Next.js App Router structural decisions (Data Access Layer, Server/Client Component boundary, route groups, Server Action placement). Use proactively whenever creating a new component or file, deciding folder structure, extracting a hook/util/service, placing business or domain logic, or refactoring for organization — even if the user just says 'where should this go' or 'this component is getting messy.' Does NOT cover component internals, hooks misuse/memoization, performance, or accessibility — see react-best-practices and next-best-practices for those."
user-invocable: false
version: 1.0.0
---

# Frontend UI Architecture

Architecture and organization guidance for `@devdigest/web` (Next.js 15 App Router, React 19, TypeScript) — and for React/Next.js code generally. This skill is deliberately narrow: it answers **where code should live and how it should be split**, not whether a hook is written correctly, whether a component re-renders too often, or whether a button has an `aria-label`. For those, defer to `react-best-practices` and `next-best-practices`.

Full source bibliography: [README.md](./README.md). Deeper annotated research (including every disagreement between sources): [research-notes.md](./research-notes.md).

## The one rule underneath most of the others

Across nearly every reputable source researched for this skill, one heuristic recurs regardless of what's being extracted (component, hook, util, constant, type):

> **Code lives as close as possible to where it's used until a second consumer genuinely needs it — then, and only then, promote it to a shared location.**

This beats pre-emptively building `shared/`, `common/`, or `utils/` folders "just in case." It also beats never sharing anything. When in doubt about any placement question below, this is the default answer.

There's a live, unresolved debate in the community about the *top-level* axis this applies within — organize primarily by **feature/domain** (Bulletproof React, Feature-Sliced Design, Wieruch) vs. primarily by **technical function** (`components/`, `hooks/`, `lib/` — Josh Comeau). **This codebase already follows the function-based convention** (`client/src/app`, `src/components`, `src/lib`, `src/lib/hooks` — no `features/` folder), so default to that unless the user is deliberately restructuring. Escalate to feature folders only when the app grows enough that `components/` or `lib/` becomes hard to navigate, or when a feature would otherwise need its own deployable package (see [references/react-organization.md](./references/react-organization.md#1-folder-structure)).

## Where components should live

- Colocate a component with its one consumer until a second consumer needs it; then promote it to `src/components/` (this repo's shared layer).
- Inside `client/src/app/`, prefer Next.js **private folders** (`_components/`, `_lib/`) for route-local UI/helpers that shouldn't be routable — see [references/nextjs-architecture.md](./references/nextjs-architecture.md#app-directory-layout).
- One component per file; colocated small internal helper components are fine in the same file.

Full decision tree, escalation path, and the feature-vs-function tradeoff in depth: [references/react-organization.md § 1](./references/react-organization.md#1-folder-structure).

## How to break a component down

Don't use a line-count threshold in isolation — use it alongside these concrete smells (from Alex Kondov's refactoring heuristics, which held up best across sources because they're testable, not vibes):

- Multiple unrelated `useState` calls doing unrelated jobs in one component
- Large/branchy conditional JSX (nested ternaries, many early-return-worthy conditions)
- A function inside the component that doesn't touch component state or props
- `.map()` bodies or inline render functions that are more than a couple of lines

Extraction order when a component needs to be split (do these in order, don't jump straight to sub-components):
1. Pull data-fetching/stateful logic into a custom hook.
2. Move pure functions that don't touch state into standalone utils.
3. Split genuinely distinct JSX regions into child components — but unify near-duplicate markup instead of splitting it into near-identical siblings.
4. Extract inline `.map()`/render-function bodies into dedicated components.

Reach for an existing library (`@tanstack/react-query`, form libraries) before building custom structure for a problem it already solves.

More detail, including the container/presentational pattern's history (created by Dan Abramov in 2015, retracted by him in 2019 in favor of hooks — don't present it as current default guidance) and a "hexagonal ports/adapters" framing for more complex features: [references/react-organization.md § 2](./references/react-organization.md#2-component-decomposition).

## Where constants belong

Placement follows the colocate-until-shared rule above. For *how* to express a fixed set of values, pick based on runtime needs, not habit:

| Need | Use |
|---|---|
| Compile-time-only type safety, no runtime values needed | Union of string literals |
| Need the values at runtime (build a UI list, look up a display label) | `const object` with `as const` |
| Publishing a library for external/cross-team consumption where nominal typing matters | `enum` (rare in application code) |

Default to `const object`/union types over `enum` — TypeScript's own docs moved away from enums for this reason in 2019, and enums generate runtime reverse-mapping code that bloats bundles for no benefit in normal app code. Full reasoning and edge cases: [references/react-organization.md § 3](./references/react-organization.md#3-constants).

## Utils vs. hooks vs. services

This is a single axis, not three arbitrary buckets — decide by asking what the code actually needs to run:

- **Needs React's render/hook rules (state, effects, context)?** → custom hook.
- **Pure function, no React, no I/O, portable to any project unchanged?** → utility/helper.
- **Pure function that encodes an actual business rule (still no React, but domain-aware)?** → domain logic — usually still fine living next to the feature; only pull it into a dedicated domain layer if the app has real business rules worth protecting (see caveat below).
- **Performs actual I/O (network, storage, sockets)?** → service/client. In this repo, the API client lives at `client/src/lib/api.ts` — extend that pattern rather than fetching inline in components or hooks.

Full extraction-criteria table and testing implications: [references/react-organization.md § 4](./references/react-organization.md#4-utils-vs-hooks-vs-services).

## Where business logic belongs

- Never in the component body — components should render based on data and trigger events, nothing else.
- Data fetching and stateful wiring go in custom hooks (the project already has `src/lib/hooks/`); hooks are the natural boundary that keeps components mockable in tests with one seam instead of many.
- **Caveat that matters more than the rule itself:** a full domain layer (DTOs, mappers, ports/adapters) is explicitly called overkill by multiple sources for apps that are thin CRUD wrappers around an API. Don't introduce one preemptively — only reach for it where this app actually has business rules worth protecting from UI churn.
- If/when server-side state coordination grows enough to need a dedicated store, there are two genuinely different defaults in the ecosystem (single store with slices, vs. many small independent stores) — see [references/react-organization.md § 5](./references/react-organization.md#5-business-logic--state-coordination) before picking one, since it's an architectural commitment, not a style preference.

## Next.js App Router architecture

Next.js's forced file-based routing (`app/` folders = URL segments) creates a real tension with feature/function-based organization above. The resolution used across good sources: **keep `app/` thin** — route files import and render, they don't implement logic — and put real code in `src/lib`, `src/components`, private folders, or (if the app grows into full feature-sliced territory) a parallel tree the router never sees.

Key structural rules specific to App Router:
- **Data Access Layer**: centralize server-only data access + authorization in one place (e.g. `src/lib/`, guarded with `server-only`) rather than scattering DB/auth checks per route or Server Action. A page-level auth check does **not** protect Server Actions or Route Handlers defined within that page — each is an independently reachable endpoint and must re-verify auth itself.
- **Server/Client boundary**: default to Server Components; push `"use client"` to the smallest leaf component, not whole subtrees. Server Components passed as `children`/props into a Client Component stay server-rendered.
- **Route groups** (`(group)`) are a legitimate architectural tool for team/feature/access-level boundaries, not just URL cosmetics — but crossing between two route groups with *different root layouts* forces a full page reload, not a client-side transition. Budget for that cost before using route groups as an auth boundary.
- **Server Actions**: colocate per feature/route (`app/orders/actions.ts`), not in one global `actions/` folder — same colocate-until-shared logic as hooks/utils above, applied to mutations.

Full detail: [references/nextjs-architecture.md](./references/nextjs-architecture.md).

## Barrels, naming, import boundaries

- Default to **avoiding barrel files** (`index.ts` re-exports) in this codebase — they measurably hurt tree-shaking, dev-server memory, and `tsc` time, and are a common source of circular-dependency bugs. This is a real disagreement in the community (Josh Comeau deliberately uses and defends them for app-sized, non-library code) — if the team decides otherwise, that's a legitimate call, just make it deliberately rather than by accident.
- Filenames match their default export (`RepoCard.tsx` exports `RepoCard`); PascalCase for components, camelCase for hooks/utils.
- If import-direction rules (e.g. "shared code must not import from feature code") start mattering, enforce them with a tool (`eslint-plugin-boundaries`, `dependency-cruiser`) rather than relying on convention alone — see [references/react-organization.md § 6](./references/react-organization.md#6-barrels-naming-import-boundaries).
