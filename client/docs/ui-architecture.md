# client — Architecture: Server vs. Client Component boundaries

This app is a Next.js 15 App Router app, but in practice it is **almost entirely Client Components** — this is the honest state, not a target architecture to aspire to.

## The one real piece of server-side work

`src/app/layout.tsx` (the root layout) is the only place that does genuine server-side data fetching: `await getLocale()` and `await getMessages()` from `next-intl/server`, before wrapping `children` in `NextIntlClientProvider` (i18n) and `Providers` (`src/lib/providers.tsx` — the client-side `QueryClientProvider`). This is i18n plumbing, not domain data.

## Server Component "shells" that fetch nothing

Two page-level files have no `"use client"` directive and are technically Server Components — but neither does any data fetching. Each is a one-line pass-through to a client child:

```tsx
// src/app/agents/page.tsx
export default function AgentsPage() {
  return <AgentsListView />;
}
```

Same pattern for `src/app/settings/[section]/page.tsx` → `SettingsView`. Don't read these as "the RSC boundary" — they exist because Next requires a `page.tsx` per route, not because server-side data loading happens there.

## Everything else is `"use client"`

`src/app/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/agents/[id]/page.tsx`, `src/app/repos/[repoId]/pulls/page.tsx`, and `src/app/repos/[repoId]/pulls/[number]/page.tsx` all open with `"use client"`. There are no `route.ts` Route Handlers anywhere in `src/app` — the API lives entirely in `server/`.

## Where domain data actually comes from

Every piece of domain data (repos, PRs, agents, reviews, findings, settings) flows through a TanStack Query hook in `src/lib/hooks/*.ts`, which calls the Fastify API via `src/lib/api.ts` — never server-fetched, never fetched directly in a component. This is the `client/CLAUDE.md` convention ("Never `fetch` directly in a component — go through a hook") and it holds with no exceptions found in this codebase.

**Practical implication**: if you're deciding where to put a new server-side data load, there isn't an existing pattern for it in this app yet — you'd be introducing the first one. The default, proven path is still "add a hook in `src/lib/hooks/*`, call it from a `"use client"` component."
