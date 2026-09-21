# frontend-ui-architecture

**Version:** 1.0.0

React + Next.js code organization and architecture guidance for `@devdigest/web` (and React/Next.js code generally): where components/files should live, how to break a component down, where constants belong, when to extract a util vs. a hook vs. a service, where business logic belongs, and Next.js App Router structural decisions. Deliberately scoped to **architecture and organization only** — component internals, hooks correctness, performance, and accessibility are covered by the sibling `react-best-practices` and `next-best-practices` skills, not here.

- Skill instructions: [SKILL.md](./SKILL.md)
- Framework-agnostic React reference: [references/react-organization.md](./references/react-organization.md)
- Next.js App Router-specific reference: [references/nextjs-architecture.md](./references/nextjs-architecture.md)
- Full annotated research (every source's claims, and every place two sources disagree): [research-notes.md](./research-notes.md)

## Sources

Official docs and reference architectures:

- [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) — React core team
- [Next.js Docs — Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure) — Vercel
- [Next.js Docs — How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security) — Vercel
- [Next.js Docs — How to implement authentication in Next.js](https://nextjs.org/docs/app/guides/authentication) — Vercel
- [Next.js Docs — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — Vercel
- [Next.js Docs — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — Vercel
- [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — alan2207
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview)
- [Feature-Sliced Design — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments)
- [Feature-Sliced Design — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide)
- [Redux Style Guide](https://redux.js.org/style-guide/) — Redux core team
- [Airbnb JavaScript Style Guide](https://javascript.airbnb.tech/)
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md) — javierbrea
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — sverweij

Respected independent authors:

- [Robin Wieruch — React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/)
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)
- [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/)
- [Alex Kondov — Common Sense Refactoring of a Messy React Component](https://alexkondov.com/refactoring-a-messy-react-component/)
- [Alex Kondov — Hexagonal-Inspired Architecture in React](https://alexkondov.com/hexagonal-inspired-architecture-in-react/)
- [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) (2015, updated 2019; direct fetch returned HTTP 403 — annotated via secondary sources)
- [TkDodo (Dominik Dorfmeister) — Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
- [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- [Cam McHenry — The Difference Between TypeScript Unions, Enums, and Objects](https://camchenry.com/blog/typescript-union-vs-enum-vs-object)

Community/publication pieces:

- [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/)
- [Screaming Architecture — Evolution of a React Folder Structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) (dev.to)
- [Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026)](https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm) (dev.to)
- [TypeScript Enums Are Still Controversial in 2026](https://dev.to/jsmanifest/typescript-enums-are-still-controversial-in-2026-here-is-when-to-use-them-and-when-to-reach-for-4fee) (dev.to)
- [Domain layer — Stop putting your business logic in components](https://medium.com/@WebDevPlaybook/domain-layer-stop-putting-your-business-logic-in-components-b56a7aca20c6) (Medium, found via search)
- [App Router Directory Design: Next.js Project Structure Patterns](https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo) (dev.to)
- [dependency-cruiser — Taking frontend architecture seriously](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) (Xebia)
- [dependency-cruiser — Avoid cross-module dependencies](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) (dev.to)

Discussions:

- [Zustand — GitHub Discussion #2496: single vs multiple stores](https://github.com/pmndrs/zustand/discussions/2496)
- [Zustand — GitHub Discussion #2486: good practice, one store vs separate stores](https://github.com/pmndrs/zustand/discussions/2486)
- [TanStack Query — Project structure suggestions (Discussion #3017)](https://github.com/TanStack/query/discussions/3017)
- [GitHub Discussion — NextJS 16, folder structure for server actions (#184740)](https://github.com/orgs/community/discussions/184740)

## Known open disagreements

These are preserved deliberately rather than papered over — see [research-notes.md](./research-notes.md#open-tradeoffs--disagreements) for full detail on each:

1. Feature-based vs. function-based top-level organization (this skill defaults to function-based, matching this repo's current structure)
2. Barrel files: avoid (default here) vs. deliberate use as a public-API boundary
3. Single store vs. multiple small stores for client state
4. How much architecture (domain layers, DTOs, ports/adapters) is warranted for a given app's complexity
5. Domain-based vs. runtime-based split for code living outside Next.js's `app/` directory

## Changelog

- **1.0.0** (2026-09-20) — Initial version, compiled from dedicated React and Next.js architecture research (34 sources).
