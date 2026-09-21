# Next.js App Router Architecture — Reference

Scoped to **architecture**, not performance — image/font optimization, bundling/code-splitting, and streaming/Suspense-for-perceived-speed are covered by `next-best-practices`, not here. Full bibliography in [../README.md](../README.md).

## The core tension

App Router forces file-based routing: folders under `app/` are URL segments, whether you want them to be architectural units or not. Every good source resolves this the same general way — **keep `app/` thin**. Route files (`page.tsx`, `layout.tsx`) import and compose; they don't implement business logic. Next.js's own docs say directly: "Routes should assemble features and widgets, not implement domain logic."

Where the real code goes *outside* `app/` is where sources genuinely diverge on the second axis:
- **Domain-based** (Feature-Sliced Design's Next.js guide): a parallel `src/` tree split by business domain (`features/`, `entities/`, `shared/`) that the router never sees.
- **Runtime-based** (community "App Router Directory Design" pattern): split by `client/` vs `server/` vs `shared/` — a coarser, structural guard against server code (secrets, DB clients) accidentally leaking into the client bundle.

This repo's `client/src` currently uses neither in pure form — it's function-based (`components/`, `lib/`) with `app/` for routing, which is closest to Next.js's own "keep `app/` for routing, shared code lives in top-level folders" strategy (one of three the docs explicitly list with no preference). Don't force a wholesale migration to FSD or the client/server split unless the app's complexity actually demands it — introduce the *principles* (thin `app/`, real code elsewhere, colocate Server Actions) without importing an entire methodology wholesale.

## App directory layout

- **Private folders** (`_components/`, `_lib/`): prefix with `_` to opt a folder out of routing. Useful for route-local UI/helpers, but not required for safety — colocation inside `app/` is already safe by default because only `page`/`route` files are ever routable.
- **Route groups** (`(group)`): group routes by team/concern/feature or define multiple root layouts, without affecting the URL. Real structural cost: navigating between two routes under **different root layouts** (e.g. `(marketing)` vs `(dashboard)`) forces a full page reload, not a client-side transition. If you're using route groups to hard-partition public vs. authenticated sections, that cost is part of the design, not a bug.
- Two route groups must not resolve to the same URL — grouping is invisible to the router but shares one flat URL namespace.

## Server/Client Component boundary

- Layouts/pages are Server Components by default. Add `"use client"` to the **smallest possible leaf** (e.g. a search input inside an otherwise-static layout) — not to whole subtrees.
- Once a file has `"use client"`, everything it **imports and directly renders** is pulled into the client bundle. Server Components passed in as `children`/props (not imported) stay server-rendered — this is what makes "interleaving" work: a Client Component shell (e.g. a modal) can still wrap a Server Component (e.g. a data-heavy panel) passed as `children`.
- Context providers are the one place React requires a client boundary even for pure plumbing — render providers as deep as possible in the tree (wrapping `{children}`, not `<html>`) so Next.js can statically optimize everything above them.
- A shared `layout.tsx` should almost never be a Client Component — doing so downgrades every descendant page to CSR, losing SSR for the whole subtree. Push `"use client"` down, never up.
- Third-party components that use client-only hooks but don't declare `"use client"` themselves: re-export through a thin local Client Component wrapper, isolating the vendor dependency's client-ness to one file.

## Data Access Layer (DAL)

Next.js's own guidance ranks three data-access approaches by project maturity and recommends the middle one as the default for new projects:
1. External HTTP APIs (zero-trust) — for existing large apps/orgs
2. **Dedicated Data Access Layer** — recommended default for new projects
3. Component-level data access — prototypes only

A DAL should:
- Run only on the server (enforce with a `server-only` import)
- Perform authorization checks in one centralized place
- Return minimal **DTOs**, not raw DB rows — this is what reduces the risk of authorization bugs vs. scattering checks per route
- Provide a cached `getCurrentUser()`-style function (wrapped in React's `cache()`) as the single source of truth for the session, with `canSeeX(viewer, ...)` predicates gating each field a DTO exposes

**Critical rule, not a suggestion**: a page-level or layout-level auth check does **not** protect Server Actions or Route Handlers defined within/near that page. Each Server Action and Route Handler is its own independently reachable endpoint (effectively a POST/GET) and must re-verify auth/authorization itself, by calling into the DAL — not by trusting that "the page already checked."

**Explicit anti-pattern**: doing the only auth check in a shared `layout.tsx`. Layouts don't re-render on client-side navigation and don't control whether sibling route segments or parallel slots render — a layout-only check can silently fail to protect nested routes. Checks belong close to the data source or the component being conditionally rendered, called from Server Components, Server Actions, and Route Handlers alike via one shared `verifySession()`-style DAL primitive.

Defense in depth: optimistic checks in `proxy.ts`/middleware (cookie-only, fast, good for redirects/UX) **plus** secure checks in the DAL (DB-verified) — middleware alone is explicitly called insufficient as the only line of defense.

## Server Actions

- Colocate per feature/route (`app/orders/actions.ts`, `app/users/actions.ts`) rather than centralizing into one global `/actions` folder — a global folder "harms separation of concerns" once the app has more than a couple of features, per community consensus with no dissenting source found.
- Keep Server Actions thin: delegate auth + authorization + DB logic to a `server-only` DAL function, called from the action. The action is the entry point, not the implementation.
- **Server Actions vs. Route Handlers**: Server Actions for mutations colocated with and specific to a route/feature (cancel an order, update a profile). Route Handlers for anything consumed by external clients (webhooks, mobile apps, third-party integrations). Both are "public-facing API endpoints" for security purposes — neither gets to skip its own auth check.
