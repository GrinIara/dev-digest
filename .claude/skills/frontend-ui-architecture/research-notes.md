# React/Frontend Code Organization & Architecture — Research Sources

This is **raw research**, not a finished skill. It's a collection of annotated
sources to be compiled later into a `SKILL.md`/README for a new
`react-frontend-architecture` skill. That skill is meant to sit alongside the
existing `.claude/skills/react-best-practices/SKILL.md` (which already covers
component purity, hooks misuse, state, memoization, performance, a11y) and go
deeper specifically on: folder/file structure, component decomposition,
constants placement, utils/hooks/services boundaries, business-logic
placement, and related organization concerns (barrels, naming, import
boundaries, Next.js vs SPA). No prescriptive rules are written here —
just claims, evidence, and disagreements for someone else to distill.

---

## 1. Where components should physically reside (folder structure)

### [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
*alan2207 (open-source reference architecture), actively maintained*
- Root `src` splits into `app`, `assets`, `components` (shared), `config`, `features`, `hooks` (shared), `lib`, `stores` (global), `testing`, `types`, `utils`.
- Each feature folder (`features/awesome-feature`) gets its own optional `api/`, `assets/`, `components/`, `hooks/`, `stores/`, `types/`, `utils/` — "only include the ones that are necessary for the feature."
- Hard rule: **features must not import from other features**; cross-feature composition happens at the `app`/page level.
- Enforce unidirectional import flow (`shared → features → app`) with ESLint `import/no-restricted-paths`.
- Explicitly recommends **avoiding barrel files** to preserve bundler tree-shaking (Vite specifically called out).

### [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview)
*feature-sliced.design (community-driven open architecture methodology)*
- Defines 7 layers top-to-bottom: `app`, `processes` (deprecated), `pages`, `widgets`, `features`, `entities`, `shared`.
- **Import rule**: a module may only import from layers strictly *below* it — never sideways, never up. This is enforced, not a suggestion.
- Goals stated explicitly: uniformity across projects, stability (isolated changes don't ripple), controlled reuse (balances DRY vs coupling), and business-language alignment.
- Positions itself as a full alternative to ad hoc "feature folders" — it's a layered methodology, not just a folder convention.

### [Feature-Sliced Design — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments)
*feature-sliced.design*
- Standard **segments** (grouping by technical purpose) are `ui`, `api`, `model`, `lib`, `config`. Avoid generic segment names like `components`/`hooks`/`types` — name by purpose.
- **Slices** (grouping by business meaning, e.g. `photo`, `comments`) are not standardized in name and are chosen per domain.
- **Cross-slice import rule**: a slice can only import other slices from strictly lower layers — slices on the same layer are isolated from each other (zero coupling by design).
- **Every slice must expose a public API** (effectively an `index.ts`) — outside code may only import through that, never reach into internal files.
- Slices may be visually grouped in folders but must not share code even within that grouping — grouping is cosmetic, not architectural.

### [Robin Wieruch — React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/)
*Robin Wieruch, respected independent React educator*
- Describes folder structure as a **5-step natural progression**, not a fixed target: (1) single file → (2) multiple files → (3) per-component folders (colocated tests/styles/types) → (4) technical folders (`components/`, `hooks/`, `utils/`) *plus* `features/` → (5) domains/packages/monorepo split.
- Concrete boundary rule: **"code flows in one direction. From shared utilities into features, and from features into pages. Never the other way around."**
- Rule of thumb for extraction: code lives inside a feature until **two or more features need it**, then it's promoted to the shared layer — applies to utils, hooks, context, and components alike.
- Avoid more than ~2 levels of nesting as a rule of thumb (not absolute).
- Explicitly favors colocation over premature abstraction; treats barrel files as acceptable "public API" boundaries despite tree-shaking cost, which is a **direct disagreement** with Bulletproof React's stance.
- Escalate to `domains/`, `packages/`, and multi-app monorepo structure only when you actually need multiple deployable apps or a versioned shared UI package — not preemptively.

### [Screaming Architecture — Evolution of a React Folder Structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
*profy.dev (dev.to mirror)*
- Frames folder structure as an evolution through 5 concrete stages: group-by-file-type → type-based with nesting → `pages/` + shared types → colocation → feature-driven ("screaming architecture").
- Invokes Bob Martin's "screaming architecture" idea: the top-level folder structure should reveal *what the system does* (e.g. `features/todos`, `features/projects`), not that it's "a React app."
- Named tradeoff table: type-based is simple but doesn't scale (folder bloat, scattered related code); feature-driven is self-documenting and refactorable but requires discipline to keep feature boundaries from becoming arbitrary.

### [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)
*Kent C. Dodds*
- Core principle, credited partly to Dan Abramov: **"place code as close to where it's relevant as possible"** / "things that change together should be located as close as reasonable."
- Concrete applications: keep explanatory comments next to the code they describe; keep unit tests next to the module they test (not in a mirrored `test/` tree); keep integration tests within the feature folder they cover; **e2e tests belong at the project root** since they cross multiple systems/features.
- Advocates CSS-in-JS / co-located styles specifically because it binds styles to the component that uses them.
- Explicit anti-premature-abstraction stance: keep a utility function inside the file/component that uses it until it's *actually* reused elsewhere — don't pre-extract to a central `utils/` folder "just in case."

### [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/)
*Josh W. Comeau*
- **Disagrees directly with feature-based advocates**: argues for organizing primarily **by function** (`components/`, `hooks/`, `helpers/`) rather than by feature, because "real life isn't nicely segmented" and feature boundaries drift out of sync with the code as products evolve.
- Colocates a hook with its one consuming component when it's component-specific; only promotes to a shared `src/hooks/` directory once it's genuinely reusable — same "colocate until shared" principle as Wieruch/Bulletproof React, but layered on top of a function-first, not feature-first, top level.
- Actively **uses and defends barrel (`index.ts`) files**, explicitly rejecting the "anti-barrel movement" as premature optimization for typical app-sized (non-library) codebases — a **direct disagreement** with Bulletproof React and the barrel-file critiques in section 6.
- Naming: kebab-case for hooks/helpers (`use-throttled-state.js`, `category.helpers.ts`), PascalCase for components — consistency matters more than the specific choice.

### [Next.js Docs — Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure)
*Vercel / Next.js official docs*
- States explicitly that Next.js is **unopinionated** about project organization but provides mechanisms: colocation is safe by default inside `app/` because only `page`/`route` files are ever routable — any other colocated file is inert for routing purposes.
- **Private folders** (`_folderName`) opt a folder and all subfolders out of routing; useful for separating UI/implementation detail from routing concerns and avoiding collisions with future Next.js file conventions — purely a convention, not required for safety (colocation is already safe without it).
- **Route groups** (`(folderName)`) organize/group routes and enable multiple layouts at the same URL segment level without affecting the URL.
- Lists three named high-level strategies teams actually use, with no recommendation of one over another: (a) all app code outside `app/`, keeping `app/` purely for routing; (b) all app code in shared top-level folders *inside* `app/`; (c) split by feature/route, with only globally-shared code at the `app/` root.
- Explicit closing guidance: "choose a strategy that works for you and your team and be consistent across the project" — i.e., no single canonical answer even from the framework maintainers.

---

## 2. Component decomposition — size, container/presentational, composition

### [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react)
*React core team, official docs*
- Gives three lenses for deciding component boundaries: separation-of-concerns (does this component do one thing?), a CSS-selector lens (would this be its own class selector?), and a design lens (how are design layers organized in the mockup?).
- Notes that well-structured data models tend to map naturally onto component structure.
- Three-question test for "is this state at all": does it stay unchanged over time? is it passed in via props? can it be computed from existing state/props? If any is yes, it's *not* state — compute it instead of storing it (an explicit DRY-for-state heuristic).
- Algorithm for **where state should live**: find every component that needs it, find their closest common parent, put the state there (or higher if no clean common parent exists) — this is the canonical "lift state up" procedure and underlies most later container/hook-based patterns.

### [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
*Dan Abramov, 2015, updated 2019 (React core team) — content summarized via multiple secondary sources; direct fetch returned HTTP 403*
- Original pattern: **presentational** components own "how things look" (markup/styles, minimal own state, receive data/callbacks via props); **container** components own "how things work" (state, data fetching, wiring).
- Abramov's **2019 update reverses the original recommendation**: with Hooks (React 16.8+), a custom hook can now do what a container component used to do, without the extra wrapper-component layer — he says he no longer recommends splitting components this way as a default pattern.
- The pattern is still common in code written 2015–2018 and in older Redux (`connect`-based) codebases — recognizing it matters for reading/maintaining legacy code even if not for writing new code.

### [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/)
*patterns.dev (Lydia Hallie / Addy Osmani et al.)*
- Restates the same split concretely with code: presentational component is a pure function of props (no state, no fetching); container component owns `state`/lifecycle and fetches then hands data down.
- States the pattern can be "overkill in smaller sized applications."
- Names the modern replacement directly: a custom hook (e.g. `useDogImages`) achieves the same separation "with less boilerplate" and without a wrapper component — consistent with Abramov's own 2019 reversal.

### [Alex Kondov — Common Sense Refactoring of a Messy React Component](https://alexkondov.com/refactoring-a-messy-react-component/)
*Alex Kondov*
- Does **not** give a line-count threshold; instead lists concrete *code smells* that signal a component should be split: multiple unrelated `useState` calls in one component, large/branchy conditional JSX, dead/commented-out code and unused imports, and functions mixing fetching + formatting + side effects in one place.
- Extraction order/priority he recommends: (1) pull data-fetching/stateful logic into a custom hook first, (2) move pure functions that don't touch component state into standalone utils, (3) split genuinely distinct JSX blocks into child components (but unify near-duplicate markup instead of splitting it), (4) extract inline render functions/`.map()` bodies into dedicated components.
- Explicit principle: "functions should live inside the component only if they need to access state" — otherwise they belong outside as plain functions.
- Pragmatic caveat: recommends reaching for existing libraries (`react-hook-form`, `react-query`) before building custom architecture for problems those libraries already solve well.

### [Alex Kondov — Hexagonal-Inspired Architecture in React](https://alexkondov.com/hexagonal-inspired-architecture-in-react/)
*Alex Kondov*
- Maps hexagonal/ports-and-adapters architecture onto React: **custom hooks act as "ports"** — the boundary between business logic and the UI, returning ready-to-render data/callbacks and hiding infrastructure details.
- **Services/clients act as "adapters"** — the only layer allowed to touch HTTP/sockets/DB, deliberately React-agnostic.
- **Domain logic** (validation, mapping) lives in plain framework-agnostic functions/objects, callable from hooks but not dependent on them.
- Rule for components: "a React component should only render elements based on data and trigger events" — no API/socket/business-logic knowledge in the component itself.
- Stated payoff: you can mock a single hook in tests instead of mocking multiple libraries/services, and internal refactors don't ripple into components.

---

## 3. Where constants should live; enums vs const objects vs unions

### [Cam McHenry — The Difference Between TypeScript Unions, Enums, and Objects](https://camchenry.com/blog/typescript-union-vs-enum-vs-object)
*Cam McHenry*
- Concrete decision table: **union types** — compile-time only, zero runtime/bundle cost, best when values are only needed for type-checking and uniqueness matters.
- **Const objects (`as const`)** — needed when you need the values *at runtime* (e.g. to build a UI list) or when internal values legitimately differ from display names; efficient bundle-wise since no reverse mapping is generated.
- **Enums** — carry runtime cost (generated reverse-mapping code can bloat bundles), and the article's default recommendation is essentially "probably never" for app code — const objects give equivalent benefits with smaller output and no TS-specific runtime construct.
- Notes union types don't dedupe/enforce uniqueness the way an object literal naturally would; const objects support computed/dynamic values, unions support template-literal-based subtyping.

### [TypeScript Enums Are Still Controversial in 2026 — DEV Community](https://dev.to/jsmanifest/typescript-enums-are-still-controversial-in-2026-here-is-when-to-use-them-and-when-to-reach-for-4fee)
*jsmanifest, dev.to — found via search, corroborates the above*
- Recommends `object as const` for most new application code; reserves enums for cases like publishing a library for wider/cross-consumer use where reverse mapping or nominal typing genuinely matters.
- Notes the React core team itself documented choosing string-literal unions over enums back in 2019 — an early, influential precedent for the union-over-enum default in the React ecosystem specifically (not just TS in general).

### (Cross-reference) Redux Style Guide — state/action naming
See section 5 below — the Redux Style Guide's naming rules (`selectThing` prefix for selectors, `"domain/action"` action-type format, naming state slices by *data type* not by component) function as a de facto constants/naming convention specific to state-shape code, distinct from generic UI constants.

---

## 4. Utilities vs custom hooks vs services — extraction criteria

### [Robin Wieruch — React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/)
*(see section 1 for full annotation)*
- Direct quote-level rule of thumb: **if exactly one feature uses a util, it lives inside that feature; once two or more features need it, it moves up to the shared layer** — and "the same logic applies to hooks, context, and components," making this a single unifying extraction rule across all four artifact types.
- Draws the hooks-vs-utils line on one axis: **custom hooks are for React-specific logic** (state, effects, context — anything that must run inside React's render/hook rules); **utility/helper functions are for non-React logic** usable anywhere, including outside React entirely.

### [Alex Kondov — Refactoring / Hexagonal-Inspired Architecture](https://alexkondov.com/refactoring-a-messy-react-component/) & [Hexagonal-Inspired Architecture in React](https://alexkondov.com/hexagonal-inspired-architecture-in-react/)
*(see section 2 for full annotation)*
- Adds a testing-driven criterion beyond Wieruch's "who uses it": a function belongs as a **utility** if it's a "toolbox" function portable to another project with minimal changes (pure, no domain knowledge); it belongs as **domain logic** if it encodes business rules even though it's still a pure function; it belongs in a **custom hook** specifically when it needs React's lifecycle/state; it belongs in a **service/client** only when it performs actual I/O (network/socket/storage).
- Explicit reason to prefer hooks-as-ports over services-as-ports for anything UI-adjacent: hooks are the natural mockable seam for component tests, whereas mocking multiple raw service calls per test is more brittle.

### [Domain layer — Stop putting your business logic in components](https://medium.com/@WebDevPlaybook/domain-layer-stop-putting-your-business-logic-in-components-b56a7aca20c6) (found via search, not independently fetched)
- Argues business rules should be pure functions/types with **no** React, API-client, or third-party-library imports — that purity is what makes them cheap to unit test without component or network mocking.
- Explicit caveat found in the same search cluster (from a related "Clean React Architecture" piece): if an app is a thin CRUD wrapper around an API, adding a full domain layer with DTOs/mappers is "a waste of time" — the domain-layer pattern is scoped to apps with actual business rules, not universally recommended.

---

## 5. Where business logic belongs — services, hooks, state management, FSD

### [Redux Style Guide](https://redux.js.org/style-guide/)
*Redux core team (Mark Erikson et al.), official docs, tiered Priority A/B/C rules*
- **Priority B ("Strongly Recommended")**: structure the app with **feature folders**, and put each feature's Redux logic in a single "slice" file using Redux Toolkit's `createSlice` — this is the modern "ducks" pattern, explicitly contrasted with the older folder-by-type (`actions/`, `reducers/`) approach, which the guide says to avoid.
- **Priority B**: normalize relational/nested state (by ID) rather than storing nested API response shapes directly.
- **Priority B**: name state slices by the *type of data* they hold, not by component name or by "reducer" (e.g. `{ users: {}, posts: {} }`, not `{ usersList, postsReducer }`); avoid "blind spreads" of entire action payloads into state.
- **Priority C ("Recommended")**: prefix all selectors with `select` (`selectTodos`, `selectVisibleTodoIds`); use memoized selectors (Reselect / RTK's `createSelector`) but don't create a selector for every single field — balance granularity.
- Reducers should still respond to any action type relevant to them (e.g., multiple slices reacting to a `logout` action) even though each slice "owns" its own state shape — cross-slice business rules are handled via shared action types, not direct cross-slice imports.

### [TkDodo — Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
*Dominik Dorfmeister (TkDodo), TanStack/React Query maintainer*
- Recommends **multiple small stores** over one monolithic store — an explicit contrast with Redux's single-store convention; compose across stores via custom hooks rather than a single combined store.
- Never export the raw store; export **custom hooks** that wrap selectors/actions — prevents accidental whole-store subscriptions and keeps the store's internal shape refactorable without touching consumers.
- Separate **actions** into their own namespace/object in the store (they're static references) so a single `useXActions()` hook can be exposed without extra re-render cost.
- Selectors must return **stable** references — returning a freshly-constructed object/array from a selector defeats memoization and is called out as a common mistake.

### [Zustand GitHub Discussions — single store vs multiple stores](https://github.com/pmndrs/zustand/discussions/2496) and [#2486](https://github.com/pmndrs/zustand/discussions/2486)
*pmndrs/zustand maintainers + community, GitHub Discussions*
- Community guidance converges on: if two pieces of state are **totally unrelated**, use separate stores; if they're interrelated (an action needs to update both), keep them as **slices within one store** so cross-slice actions stay simple.
- Explicitly frames this as **the opposite default from Redux** — Zustand's own docs/community push multiple small stores as the idiomatic starting point, not a single global store.

### [TanStack Query — Project structure suggestions](https://github.com/TanStack/query/discussions/3017) and [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
*TanStack/query maintainers + TkDodo, found via search*
- Favors **vertical/feature colocation** of query hooks and query keys over a horizontal `queries/`+`mutations/` split — "vertical slicing... is usually better than grouping horizontally by type."
- Query functions and query keys should generally stay **local/unexported** inside a feature's `queries.ts`; only the custom hook built on top is exported — mirrors the Zustand "export the hook, not the primitive" convention above.
- Practical escape hatch, same shape as Wieruch's utils rule: once a query is needed in a second feature, promote its definition to a shared location rather than duplicating it.

### [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) & [Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments)
*(see section 1 for full annotation)*
- Positions `entities` (business domain objects like "user", "product") and `features` (product-facing behaviors with business value) as distinct **layers**, forcing an explicit choice about whether logic is a reusable domain concept (entity) or a specific product feature — a structural forcing-function for business-logic placement that neither Redux Style Guide nor Zustand/TanStack conventions impose on their own.
- Because of the strict layer-import rule, `entities`-layer business logic literally cannot depend on `features`-layer code — a hard architectural guarantee (enforced by tooling/convention, e.g. via `steiger`/ESLint plugins in the FSD ecosystem) that domain logic doesn't leak upward into feature-specific logic.

---

## 6. Barrel files, naming, import boundaries/linting, Next.js vs SPA

### [Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026)](https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm)
*dev.to, 2026*
- Concrete measured example: a Next.js page importing **one** hook through a barrel pulled in a 552 kB client chunk; fixing the barrel (direct import) dropped it to 64 kB (~88% reduction).
- Explains *why* tree-shaking fails through barrels: bundlers can only drop a module if doing so is side-effect-free/"unobservable" — one side-effecting module inside a barrel forces the bundler to keep the whole barrel graph; CommonJS entry points defeat shaking entirely because of dynamic `module.exports` access.
- Tree-shaking is a **production-build-only** optimization — dev servers (webpack/Next dev) load the full graph regardless, so barrels specifically hurt **dev-mode** memory/compile time and `tsc` time (which scales with graph size, not actual code size) even when production bundling is fine.
- Barrels are a common **source of circular-dependency bugs** (`ReferenceError` in ESM, silent `undefined` in CJS) because importing a sibling through the barrel (`import { x } from '.'`) creates a hidden import cycle; evaluation order differs across tools (Vite vs Jest), so the same barrel can bug out in one tool and not another.
- Recommended alternatives: import directly from the source module (not through `.`), use path aliases (`@/components/Button`) for ergonomics instead of barrels, mark packages `sideEffects: false`, and for libraries specifically, ship per-module files (`preserveModules`) with subpath exports.

### [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/)
*(see section 1 for full annotation)*
- **Direct disagreement with the above**: actively uses and defends barrel files, calling anti-barrel arguments "premature optimization" for typical (non-library) app codebases, and estimates barrel resolution as <1% of total bundler work in his projects. Notes Next.js App Router specifically can create naming conflicts with barrel `index` files that need manual handling.

### [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
*(see section 1 for full annotation)*
- Also lands on the anti-barrel side, specifically citing **Vite tree-shaking** as the reason to avoid them — so among the sources gathered here, the barrel-file question splits roughly 2 (Bulletproof React, the dev.to tree-shaking piece) vs 1 (Comeau) vs 1 partial (Wieruch, who accepts the tree-shaking cost but keeps barrels anyway as a "public API" boundary).

### [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md)
*javierbrea, actively maintained npm package (v7.2.0 as of research)*
- Lets you declare architectural "elements" (e.g. `features`, `shared`, `entities`) by file pattern and then declare **dependency rules** between them (which element types may import which), enforced as real-time ESLint errors — this is the concrete tool most naturally paired with Bulletproof React's or FSD's import-direction rules rather than leaving them as unenforced convention.
- Works for monorepos, layered architectures, or fully custom structures — not tied to any one methodology.

### [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (via [Xebia write-up](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) and [dev.to write-up](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b))
*sverweij (tool author) + secondary write-ups, found via search*
- Positioned as an **architecture fitness function**: analyzes the actual import graph and fails CI on forbidden-dependency rules, orphan modules, or circular dependencies — a complementary/alternative tool to eslint-plugin-boundaries, better suited to also visualizing the graph (not just linting it) and to whole-repo/monorepo dependency audits rather than only per-file lint rules.
- Real-world usage pattern from the write-ups: adopted **incrementally** (start by only flagging new violations) rather than requiring the whole codebase to comply on day one — a practical rollout note relevant to a repo (like this one) that would be adding rules after code already exists.

### [Airbnb JavaScript/React Style Guide](https://javascript.airbnb.tech/) (redirected from `airbnb.io/javascript/react/`)
*Airbnb, long-standing widely-adopted style guide*
- Filename must exactly match the default export's name (e.g. component `CheckBox` → file `CheckBox.js`); PascalCase reserved for constructors/classes (thus components), camelCase for functions/instances/utilities.
- General "one declaration, one purpose" grouping principle (e.g. grouping all `const`s together) extends naturally to "one component per file" as the de facto convention, though the fetched page itself is the general JS guide rather than the dedicated React-specific rules page — treat the component-specific claims here as inferred/adjacent rather than verbatim React-guide text.

### [Next.js Docs — Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure)
*(see section 1 for full annotation — most relevant claims for this section:)*
- Colocation safety is an **App Router-specific guarantee** (only `page`/`route` files are ever routable) that does not exist in a plain Vite/CRA SPA — in a SPA, "colocating a file next to a route" carries no such safety net, so the private-folder (`_folder`) convention that's "optional but nice" in Next.js has no direct equivalent need in a router-less SPA.
- This is the concrete basis for treating Next.js App Router conventions as **not a strict superset** of plain-SPA conventions: feature/colocation folder strategies (section 1) still apply in both, but the specific mechanics of *where routing safety comes from* differ, and Next's own docs decline to prescribe one organization strategy over another even for App Router apps.

---

## 7. Next.js App Router Architecture

### [Next.js Docs — How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security)
*Vercel / Next.js official docs, last updated 2026-08-25*
- Three data-fetching approaches ranked by project maturity: external HTTP APIs (zero-trust, for existing large apps/orgs), a dedicated **Data Access Layer** (recommended default for new projects), or component-level data access (prototypes only) — explicit recommendation to pick one and not mix them.
- DAL should: run only on the server (enforced via `server-only` import), perform authorization checks, and return minimal **Data Transfer Objects (DTOs)** rather than raw DB rows — centralizing this in one place "reduces the risk of authorization bugs" versus scattering checks per route.
- Concrete code pattern: a cached `getCurrentUser()` (wrapped in React's `cache()`) as the single source of truth for the session, with `canSeeX(viewer, ...)` predicate functions gating each field returned by a DTO function like `getProfileDTO()`.
- Same DAL pattern extends to mutations: `"use server"` Server Actions should stay thin and delegate auth+authz+DB logic to a `server-only` DAL function (e.g. `deletePost()` in `data/posts.ts`), called from the action — mirrors the hooks-call-services split from the plain-React research (section 2/4), with the DAL playing the "service" role.
- Explicit audit checklist for reviewing a Next.js codebase: verify DB packages/env vars are only imported inside the DAL, verify Server Actions re-check auth/ownership rather than trusting a page-level check, verify return values are filtered DTOs not raw records.
- States plainly that a page-level auth check does **not** protect Server Actions defined within that page — each Server Action is its own reachable POST endpoint and must independently re-verify auth/authorization.

### [Next.js Docs — How to implement authentication in Next.js](https://nextjs.org/docs/app/guides/authentication)
*Vercel / Next.js official docs, last updated 2026-08-25*
- Recommends layering checks (defense in depth) rather than relying on one: optimistic checks in `proxy.ts`/middleware (cookie-only, fast, good for redirects/UX) plus secure checks in the DAL (DB-verified, close to the data) — "Proxy... should not be your only line of defense."
- Explicit anti-pattern called out: doing the auth check only in a shared `layout.tsx`. Because layouts don't re-render on client-side navigation and don't control whether sibling route segments/parallel slots render, a layout-only check can silently fail to protect nested routes — checks should happen "close to your data source or the component that'll be conditionally rendered" instead.
- Also flags the common SPA habit of `return null` from a top-level component when unauthorized as insufficient in Next.js, since the app has multiple entry points (Server Actions, Route Handlers, parallel slots) that bypass that single render path.
- Treats Server Actions and Route Handlers explicitly as "public-facing API endpoints" for security purposes — each must independently re-verify session/role, regardless of what UI-level checks already ran.
- Recommends a `verifySession()` helper (memoized with React `cache()`) as the DAL's core primitive, called from Server Components, Server Actions, and Route Handlers alike — one seam reused across every entry point instead of duplicated auth logic per route type.

### [Next.js Docs — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
*Vercel / Next.js official docs, last updated 2026-08-25*
- States the architectural default directly: layouts/pages are Server Components unless marked otherwise; add `"use client"` to the smallest possible leaf (e.g. a `<Search>` bar inside an otherwise-static `<Layout>`) rather than marking whole subtrees client — the concrete "where to draw the server/client split line" rule underlying "thin client leaves, server components doing composition."
- Once a file has `"use client"`, **everything it imports and directly renders** is pulled into the client bundle — but Server Components passed in as `children`/props (not imported) stay server-rendered. This is the mechanism behind the "interleaving" pattern: a Client Component like `<Modal>` can still wrap a Server Component like `<Cart>` passed as `children`, keeping data-fetching on the server even inside a client-driven UI shell.
- Context providers are the one place React requires a Client Component boundary even for "pure plumbing" — recommends rendering providers "as deep as possible in the tree" (wrapping only `{children}`, not `<html>`) so Next.js can still statically optimize everything above the provider.
- Third-party components using client-only hooks but missing `"use client"` themselves should be re-exported through a thin local Client Component wrapper — isolates the vendor dependency's client-ness to one file instead of forcing every caller to know about it.

### [Next.js Docs — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
*Vercel / Next.js official docs, last updated 2025-06-16*
- Official use cases go beyond "hide from URL": organizing routes by team/concern/feature, defining multiple root layouts, and opting specific segments into (or out of) sharing a layout — route groups are explicitly sanctioned as an architectural/team-boundary tool, not just cosmetic URL grouping.
- Caveat with a real structural cost: navigating between routes under two different root layouts (e.g. `(shop)` vs `(marketing)`) triggers a **full page reload**, not a client-side transition — relevant for teams using route groups to hard-partition an app (e.g. public vs. authenticated sections) into separate root layouts.
- Conflicting-path caveat: two groups must not resolve to the same URL (`(marketing)/about` and `(shop)/about` both → `/about` errors) — grouping is invisible to the router but still shares one flat URL namespace across groups.

### [Feature-Sliced Design — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide)
*feature-sliced.design*
- Names the tension explicitly: Next.js App Router forces file-based routing (folders = URL segments) while FSD organizes by business domain/layers — resolves it by **not** forcing FSD slices into `app/` at all.
- Concrete split: `app/` is kept as routing-only, thin composition (`app/(public)/page.tsx` just imports and renders a page component); all actual business/product code — `pages`, `widgets`, `features`, `entities`, `shared` layers — lives in a parallel `src/` tree, decoupled from the URL structure.
- Explicit directive: "Routes should assemble features and widgets, not implement domain logic" — App Router page/layout files become pure composition points that delegate immediately into the FSD `pages` layer.
- Route Handlers (`app/api/**/route.ts`) are scoped narrowly to external integrations (webhooks, third-party callbacks); Server Actions colocated within feature slices are preferred for UI-driven mutations — keeps ownership of a mutation with the feature that needs it rather than centralizing it under `app/api`.

### [App Router Directory Design: Next.js Project Structure Patterns](https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo)
*dev.to*
- Proposes a role-based top-level split as an alternative to both pure `app/`-colocation and pure feature-folders: `app/` (routing only, no business logic), `client/` (components/hooks/contexts/stores needing `"use client"`), `server/` (Server Actions, Route Handler logic, repositories, business logic), `shared/` (framework-agnostic utils/types usable by both).
- Rationale given: a hard directory-level split between client-only and server-only code makes accidental server→client leakage (secrets, DB clients) structurally harder, not just convention-enforced — a coarser-grained, project-layout version of the `server-only`/`client-only` package guard.
- Uses route groups (`(auth)`, `(main)`, `(marketing)`) to signal which pages share a concern/access level, matching the official docs' "organize by team/concern/feature" use case, then gives each group its own `layout.tsx`.
- Explicit warning against making a shared `layout.tsx` a Client Component: doing so downgrades every descendant page under it to CSR, losing the SSR benefit for the entire subtree — reinforces "push `'use client'` down, not up."
- Database schema files are organized to mirror the feature-domain directory structure (e.g. `database/app_auth/`, `database/app_billing/`) — extends feature-based organization one layer further down into the schema layer itself, not just the application code.

### [GitHub Discussion — NextJS 16, folder structure for server actions (#184740)](https://github.com/orgs/community/discussions/184740)
*GitHub community discussions*
- Consensus answer: keep Server Actions feature-colocated (`app/users/actions.ts`, `app/orders/actions.ts`) rather than centralizing them in one global `/actions` folder — mirrors the "colocate until shared" rule from the plain-React research (sections 1 and 4), applied specifically to the Server Actions boundary.
- Explicit reasoning against a global `actions/` folder: it "harms separation of concerns" once the app has more than a couple of features, forcing unrelated domains' mutation logic into one shared namespace.
- Practical decision rule offered for Server Actions vs. Route Handlers: Server Actions for mutations colocated with and specific to a route/feature (cancel an order, update a profile); Route Handlers for anything consumed by external clients (webhooks, mobile apps, third-party integrations) — positions Server Actions as the App-Router-native analog of a "service" or "business logic hook" from the plain-React research, scoped per-feature rather than globally.

---

## Sources (bibliography)

1. Bulletproof React — Project Structure — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
2. Feature-Sliced Design — Overview — https://feature-sliced.design/docs/get-started/overview
3. Feature-Sliced Design — Slices and Segments — https://feature-sliced.design/docs/reference/slices-segments
4. Robin Wieruch — React Folder Structure Best Practices [2026] — https://www.robinwieruch.de/react-folder-structure/
5. Screaming Architecture — Evolution of a React Folder Structure — https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25
6. Kent C. Dodds — Colocation — https://kentcdodds.com/blog/colocation
7. Josh W. Comeau — Delightful React File/Directory Structure — https://www.joshwcomeau.com/react/file-structure/
8. Next.js Docs — Project Structure and Organization — https://nextjs.org/docs/app/getting-started/project-structure
9. react.dev — Thinking in React — https://react.dev/learn/thinking-in-react
10. Dan Abramov — Presentational and Container Components — https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0
11. patterns.dev — Container/Presentational Pattern — https://www.patterns.dev/react/presentational-container-pattern/
12. Alex Kondov — Common Sense Refactoring of a Messy React Component — https://alexkondov.com/refactoring-a-messy-react-component/
13. Alex Kondov — Hexagonal-Inspired Architecture in React — https://alexkondov.com/hexagonal-inspired-architecture-in-react/
14. Cam McHenry — TypeScript Unions vs Enums vs Objects — https://camchenry.com/blog/typescript-union-vs-enum-vs-object
15. TypeScript Enums Are Still Controversial in 2026 (dev.to/jsmanifest) — https://dev.to/jsmanifest/typescript-enums-are-still-controversial-in-2026-here-is-when-to-use-them-and-when-to-reach-for-4fee
16. Domain layer — Stop putting your business logic in components — https://medium.com/@WebDevPlaybook/domain-layer-stop-putting-your-business-logic-in-components-b56a7aca20c6
17. Redux Style Guide — https://redux.js.org/style-guide/
18. TkDodo — Working with Zustand — https://tkdodo.eu/blog/working-with-zustand
19. Zustand — GitHub Discussion #2496 (single vs multiple stores) — https://github.com/pmndrs/zustand/discussions/2496
20. Zustand — GitHub Discussion #2486 (good practice: one store vs separate stores) — https://github.com/pmndrs/zustand/discussions/2486
21. TanStack Query — Project structure suggestions (Discussion #3017) — https://github.com/TanStack/query/discussions/3017
22. TkDodo — Effective React Query Keys — https://tkdodo.eu/blog/effective-react-query-keys
23. Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026) — https://dev.to/childrentime/barrel-files-why-indexts-re-exports-hurt-tree-shaking-nextjs-dev-memory-and-tsc-2026-3kpm
24. eslint-plugin-boundaries — https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md
25. dependency-cruiser (Xebia write-up) — https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/
26. dependency-cruiser (dev.to write-up) — https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b
27. Airbnb JavaScript Style Guide — https://javascript.airbnb.tech/ (redirected from https://airbnb.io/javascript/react/)
28. Next.js Docs — How to think about data security in Next.js — https://nextjs.org/docs/app/guides/data-security
29. Next.js Docs — How to implement authentication in Next.js — https://nextjs.org/docs/app/guides/authentication
30. Next.js Docs — Server and Client Components — https://nextjs.org/docs/app/getting-started/server-and-client-components
31. Next.js Docs — Route Groups — https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
32. Feature-Sliced Design — The Ultimate Next.js App Router Architecture — https://feature-sliced.design/blog/nextjs-app-router-guide
33. App Router Directory Design: Next.js Project Structure Patterns (dev.to/pipipi-dev) — https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo
34. GitHub Discussion — NextJS 16, folder structure for server actions (#184740) — https://github.com/orgs/community/discussions/184740

---

## Open tradeoffs / disagreements

- **Feature-based vs function-based top-level organization.** Bulletproof React, Feature-Sliced Design, Robin Wieruch, and the "screaming architecture" piece all converge on organizing primarily by *feature/domain* at the top level. Josh Comeau explicitly argues the opposite — organize primarily by *function* (`components/`, `hooks/`, `helpers/`) — on the grounds that real product features don't stay cleanly segmented over time. Both sides agree on colocating things that are genuinely single-use; they disagree on what the *default* top-level grouping axis should be.

- **Barrel files (`index.ts`).** Bulletproof React and the 2026 tree-shaking deep-dive both recommend avoiding barrels, citing measured bundle-size and dev-server-performance regressions (up to ~88% chunk-size reduction after removing one). Josh Comeau uses them deliberately and calls the concern "premature optimization" for app-sized (non-library) code. Robin Wieruch sits in between: acknowledges the tree-shaking cost but keeps barrels anyway as an intentional "public API" boundary for a folder. This is a real, unresolved split rather than a settled best practice — likely dependent on bundler (Vite vs Webpack/Next) and codebase size.

- **Single global store vs multiple small stores for state management.** Redux's own style guide assumes and reinforces a **single store** (with feature "slices"/ducks inside it). Zustand's maintainer community (TkDodo, official GitHub discussions) explicitly reverses this default, recommending **multiple small, independent stores** composed via hooks, only consolidating into one store when state is genuinely interrelated. This isn't just a library API difference — it reflects two different philosophies about where the *coordination boundary* for state should sit.

- **Container/presentational split — historical vs current guidance.** Dan Abramov both created (2015) and later retracted (2019) this pattern as a default recommendation, pointing to custom hooks as the hooks-era replacement. patterns.dev documents the same reversal. This isn't a live disagreement between sources so much as a single source's guidance changing over time — worth flagging so a future skill doesn't present the 2015 pattern as current best practice without the caveat.

- **How much architecture is warranted at all.** Several sources (the "domain layer" piece, profy.dev-adjacent clean-architecture writing, Alex Kondov) explicitly caveat their own layered/hexagonal recommendations: if the app is a thin CRUD wrapper around an API, adding a domain layer, DTOs, mappers, or ports/adapters is called out as overkill. This is a meta-disagreement worth preserving — the "right" amount of structure is explicitly framed as app-complexity-dependent, not a fixed target every app should reach.

- **Next.js App Router conventions vs plain Vite/CRA SPA conventions.** Next.js's own docs frame colocation-safety (only `page`/`route` files are routable) as an App-Router-specific guarantee with no direct SPA equivalent, and explicitly decline to prescribe one project-structure strategy even within Next.js itself ("choose what works for your team"). This means feature/colocation conventions from sections 1–5 transfer across Next.js and SPA setups in spirit, but the low-level mechanics (what's "safe" to colocate, why private folders exist) do not transfer 1:1 — a future skill should probably flag Next-specific vs framework-agnostic rules separately rather than presenting one unified rule set.

- **Next.js App Router's forced routing structure vs. feature-based colocation — concrete resolutions disagree on the split axis.** This extends the tradeoff above with actual worked answers. The Feature-Sliced Design Next.js guide resolves the router/feature tension by keeping `app/` as thin, routing-only composition and putting all FSD layers (`features`, `entities`, `shared`, `pages`) in a parallel `src/` tree the router never sees — a *domain-based* second axis. The dev.to "App Router Directory Design" piece reaches a structurally similar "keep `app/` empty of logic" conclusion but splits the parallel tree by *runtime* instead (`client/` vs `server/` vs `shared/`), not by feature/domain. Both agree App Router's file-based routing should not be where business logic lives; they disagree on what the primary non-`app/` organizing axis should be — domain (FSD) or client/server boundary (pipipi-dev) — replaying the "feature-based vs function-based" disagreement from section 1 one level up, specifically for Next.js.

- **Route groups as an architectural tool carry a real, non-performance-optimization cost.** Official Next.js docs sanction route groups for exactly the use case this research targets — organizing by team/feature/access-level, e.g. `(auth)` vs. `(marketing)` — but their own caveat is structural, not a caching/bundling footnote: crossing between two routes that use *different root layouts* defined via route groups forces a full page reload instead of a client-side transition. A future skill recommending route groups as an access-level boundary should carry this caveat rather than presenting the pattern as free.

- **Server Actions as the App-Router-native "business logic" seam is comparatively settled.** The GitHub discussion on Server Actions folder structure and the Feature-Sliced Design Next.js guide agree: avoid a single global `actions/` folder in favor of per-feature/per-route action files that delegate to a `server-only` DAL/service function. No source found argues for centralizing Server Actions — this maps directly onto the "services/hooks colocated until shared" rule already established for plain React (Wieruch, TanStack Query in sections 1 and 4) rather than requiring a new rule.

- **Auth boundary vs. route/folder boundary are two different things App Router does not align for you.** The official authentication guide's warning that layout-level checks don't protect nested route segments or parallel slots is an architectural claim about the rendering model, not just a security tip: unlike SPA router setups where one guarded route wrapper can protect an entire subtree, App Router's DAL-based recommendation means "where the auth check lives" (the DAL, called per-entry-point) and "where the folder/route boundary lives" (a route group like `(dashboard)`) are structurally decoupled — a route group communicates intent to a reader but enforces nothing on its own.
