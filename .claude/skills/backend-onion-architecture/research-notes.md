# Onion Architecture for Backend Modules — Research Sources

This is **raw research**, not a finished skill — a collection of annotated
sources to be compiled into `SKILL.md` for the `backend-onion-architecture`
skill. That skill targets `@devdigest/api` (`server/`, Fastify 5 + Drizzle ORM
0.38 over Postgres/pgvector + Zod 3) and `@devdigest/reviewer-core`
(a pure library), the repo's two backend packages. No prescriptive rules are
written here — just claims, evidence, and disagreements, gathered via web
search (search-result summaries, not full article fetches — treat depth
accordingly and re-verify a claim before leaning on it hard).

---

## 1. Onion Architecture core theory & the Dependency Rule

### [Jeffrey Palermo — The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
*Jeffrey Palermo, 2008 — the original source; coined the term*
- Written explicitly to fix tight database coupling in traditional layered ("N-tier") architecture.
- The domain model sits at the absolute center; layers wrap around it.
- **The core rule**: all code can depend on layers more central to it; no code can depend on a layer further out. Coupling always points **toward the center**.
- Inner layers **define interfaces**; outer layers **implement** them — this is what inverts the traditional "UI → business logic → data access" dependency chain.
- Application core (domain + application services) can be compiled and run in complete isolation from infrastructure (DB, UI, external services).

### [NDepend Blog — Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/)
- Restates the domain model as the innermost ring, "state, processes, rules and behavior of an organization."
- Frames Onion as a response to the *DIP* (Dependency Inversion Principle) applied at the architectural level, not just per-class.

### [Marco Lenzo — The Onion Architecture explained](https://marcolenzo.eu/the-onion-architecture-explained/)
- Reinforces: skip Onion Architecture for small CRUD apps, prototypes, or a thin layer over a single DB table — the extra interfaces + DI add cost without adding value. Appropriate for long-lived apps with real, complex domain behavior.

### [Serhat Alaftekin (Medium) — Onion Architecture: A Comprehensive Guide](https://medium.com/@serhatalftkn/onion-architecture-a-comprehensive-guide-for-modern-applications-940f007d0218)
- Modern restatement of Palermo's rings; ties Onion explicitly to testability — the domain and application layers can be unit-tested with zero infrastructure (no DB, no HTTP) because they don't depend on it.

### [theCodeReaper — The Onion Architecture](https://thecodereaper.com/2020/05/02/the-onion-architecture/) · [Methods & Tools — Chop Onions Instead of Layers](https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php)
- Both are secondary restatements of Palermo's original rings and dependency rule; no material disagreement found. Useful as alternate phrasings/diagrams if `SKILL.md` needs a second citation for the same claim.

---

## 2. Onion vs. Hexagonal vs. Clean — terminology overlap and disagreement

### [Rup Singh (Medium) — Stop Confusing Clean, Onion, Hexagonal Architecture](https://medium.com/@rup.singh88/stop-confusing-clean-onion-hexagonal-architecture-heres-when-to-use-each-692079e56267)
- **Clean Architecture** (Robert C. Martin, 2012): concentric circles, innermost = use cases + entities, then interfaces, then frameworks/drivers — explicitly *combines* ideas from both Onion and Hexagonal.
- **Onion**: "Clean's less preachy cousin" — same domain-centric rings, less prescriptive about exact ring names/count. Best when *domain knowledge* is the core complexity.
- **Hexagonal** (a.k.a. Ports & Adapters, Alistair Cockburn): reframes the same idea without rings — domain is a "socket," outside world is swappable "plugs." Chosen when maximum flexibility with external systems matters most.
- Practical takeaway for this repo: the three patterns share one non-negotiable core (dependencies point inward / toward the domain) and differ mainly in vocabulary and which concern they emphasize — not in the underlying rule.

### [dev.to — Hexagonal vs Clean vs Onion: which one survives your app in 2026](https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f)
- Corroborates the above; frames Hexagonal as best when you need many swappable external integrations (this repo's `src/adapters/*` — llm, github, git, embedder — is exactly that shape).

### [Hexagonal architecture (Wikipedia)](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))
- Canonical ports-and-adapters definition: the application core defines *ports* (interfaces); *adapters* implement them for a specific technology (a DB driver, an HTTP client, a test double). A port can have multiple interchangeable adapters — this is precisely `server/`'s existing `LLMProvider`/`GitHubClient`/`GitClient` port shapes with prod + mock adapter pairs.

### [generalistprogrammer.com — Clean Architecture Guide: Layers, Dependency Rule & vs Onion](https://generalistprogrammer.com/tutorials/clean-architecture-complete-guide)
- States the Dependency Rule most crisply: "nothing in an inner circle can know anything at all about something in an outer circle," including the *name* of an outer-circle thing — inner code only knows abstract interfaces it owns.

**Working conclusion for `SKILL.md`**: don't force a debate over "is this Onion or Hexagonal" — this repo's `server/` already blends both (Onion-style layer separation for modules/services/repositories, Hexagonal-style ports+adapters for external integrations). Name the skill "Onion Architecture" per the user's request, but the actual rule to enforce is the **Dependency Rule** common to all three: dependencies point inward, outer layers implement interfaces owned by inner layers.

---

## 3. Node.js / TypeScript / Fastify implementations found

### [Remo Jansen (dev.to) — Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) (mirrors: [Wolk Software blog](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs), [dormoshe.io](https://dormoshe.io/daily-news/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad-315))
- Four-layer Onion for Node/TS: domain objects/entities → domain services/repository *interfaces* → application services → infrastructure (repository implementations, controllers).
- Uses **InversifyJS** (a decorator-based IoC container) to wire interface → implementation bindings.
- **Important divergence for this repo**: `server/` already has its own DI mechanism — `src/platform/container.ts`, a hand-rolled container with a port + prod-adapter + mock pattern (see `server/docs/architecture.md`). Introducing InversifyJS (or any decorator-based IoC container) would be a **second, competing DI system**. `SKILL.md` must say explicitly: extend `container.ts`, don't add a new container library.

### [Sankhadip Samanta (Medium) — Onion Architecture in Node.js with TypeScript](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- Similar four-ring breakdown (domain → application → infrastructure → presentation/API), Express-based. No new information beyond the InversifyJS piece; corroborates the same ring names.

### [GitHub topics: `onion-architecture` (TypeScript)](https://github.com/topics/onion-architecture?l=typescript) and example repos ([JeffMangan/typescript-onion](https://github.com/JeffMangan/typescript-onion), [Melzar/onion-architecture-boilerplate](https://github.com/Melzar/onion-architecture-boilerplate), [mike-yuen/house-express](https://github.com/mike-yuen/house-express))
- Survey of independent reference implementations. Common thread across all of them: a `domain/` (entities, value objects), `application`/`use-cases` (orchestration, depends only on domain + repository interfaces), `infrastructure` (DB/ORM-specific repository implementations, external clients), and a thin `presentation`/`api` layer (Express/Fastify routes) that only translates HTTP ↔ use-case calls.
- None of these are Fastify-specific or type-provider/Zod-aware — useful for the general shape, not for framework-specific idioms.

### [borjatur — clean-architecture-fastify-mongodb (GitHub template)](https://github.com/borjatur/clean-architecture-fastify-mongodb) and [accompanying write-up](https://borjatur.com/2023/03/07/yet-another-vision-of-clean-architecture/)
- The one **Fastify-specific** reference found. Structures the app so Fastify route handlers are the outermost "controller" layer, calling use-case classes that depend only on repository interfaces; MongoDB-specific repository implementations sit in an outer infrastructure folder.
- Write-up explicitly frames use cases (not entities) as the natural place for orchestration in a CRUD-heavy API — a good analog for this repo's `modules/<name>/service.ts`, which already plays that "use case orchestrator" role.

**Working conclusion for `SKILL.md`**: none of the general Node/TS tutorials found are opinionated about Fastify or Drizzle specifically, and most reach for a DI library this repo doesn't use and shouldn't add. Map their layer *names* onto this repo's *existing* folder structure and DI mechanism rather than importing their exact folder layout.

---

## 4. Repository pattern & dependency inversion, with Drizzle specifically

### [Abdulrahman Mohamed (Medium) — The Repository Pattern: A Necessary Abstraction or Over-Engineering?](https://medium.com/@abied.abiad/the-repository-pattern-your-gateway-to-clean-data-c72235f34916)
- Repository interface lives in the Application/Domain layer; the concrete implementation (with ORM-specific code) lives in Infrastructure. By placing the *interface* in the domain, infrastructure imports domain types — never the reverse. This is the Dependency Inversion Principle applied specifically to data access.
- Explicit caveat in the title itself: flags repository-pattern-as-over-engineering as a live question, not settled — consistent with the "skip it for thin CRUD" caveat found in section 1.

### [vimulatus (Medium) — Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- Concrete Drizzle example: a repository class wraps Drizzle's query builder; a **mapper** function translates Drizzle's inferred row type into a domain entity/DTO before it leaves the repository, so nothing above the repository ever sees a raw Drizzle row shape.
- **This is the one concrete gap in this repo's current practice worth flagging in `SKILL.md`**: `server/src/modules/reviews/repository.ts` returns Drizzle-inferred row types directly in several methods (e.g. `getRepo(): Promise<typeof t.repos.$inferSelect | undefined>`) rather than a mapped domain type — acceptable today (small app, one consumer), but the skill should note the escape hatch (map to a domain/DTO shape) for repositories whose row shape needs to diverge from what callers should see.

### [Cosmic Python (book) — The Repository Pattern, chapter 2](https://www.cosmicpython.com/book/chapter_02_repository)
- Repository pattern's real payoff isn't "swap Postgres for Mongo someday" (rarely happens) — it's a **stable, mockable seam for unit tests**: tests can use an in-memory fake repository and never touch a real DB. Directly matches this repo's own reason for the port+mock pattern on adapters (`src/adapters/mocks.ts`), just applied one layer over (data access, not external services).

### [Klaviyo Engineering — The Repository Pattern](https://klaviyo.tech/the-repository-pattern-e321a9929f82)
- Production war-story version of the same idea: repository pattern paid off most when the team needed to add caching and instrumentation *around* data access uniformly — a single seam meant one place to add it, not N call sites.

### [João Batista da Silva (Medium) — Transactions with DDD and Repository Pattern in TypeScript, Part 2](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901)
- Addresses the hard part repository-pattern tutorials often skip: multi-repository transactions. Recommends a **Unit of Work** abstraction (a transaction-scoped object handed to repositories) rather than each repository opening its own transaction — relevant if a future `server/` use case needs atomic writes across more than one `.repo.ts` file. Not needed today (`ReviewRepository`'s methods are mostly single-statement), but worth a pointer in `references/backend-layering.md` for later.

### [Paul Serban — Drizzle ORM Best Practices: Principles, Patterns, and Real-World Case Studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- Drizzle-specific guidance: keep schema definitions (`src/db/schema.ts`) and query logic in dedicated files, never inline Drizzle queries in route handlers or business-logic files — the strongest direct match to this repo's existing convention (`*.repo.ts` files are "the ONLY layer touching the DB for the review domain," per `server/src/modules/reviews/repository.ts`'s own header comment).
- Also recommends typed query builders over raw SQL strings wherever Drizzle supports it, to keep the compiler enforcing the schema/query contract — already the case throughout `server/src/db/`.

### [Goca Blog — Mastering the Repository Pattern in Clean Architecture](https://sazardev.github.io/goca/blog/articles/mastering-repository-pattern)
- Generic reinforcement of the interface-in-domain / implementation-in-infrastructure split; no new claims beyond the sources above.

---

## 5. Enforcement tooling (flagged for a later follow-up, not built in this skill)

### [dependency-cruiser (GitHub)](https://github.com/sverweij/dependency-cruiser)
- Analyzes the real import graph and can fail a build on forbidden-dependency rules (e.g. "nothing under `modules/*/service.ts` may import `drizzle-orm`"), orphan modules, or circular dependencies.
- **Already a devDependency in `server/package.json`** (installed today, presumably for a different purpose — not yet configured with a ruleset). This makes it the natural tool if/when this skill's guidance graduates from "Claude follows it" to "CI enforces it" — noted in `references/backend-layering.md` as a sketch, explicitly marked not implemented, per the user's guidance-only decision for this deliverable.

### [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md)
- Declares architectural "elements" by file pattern and enforces which element types may import which as real-time ESLint errors (would need adding as a new devDependency, unlike dependency-cruiser). Alternative to dependency-cruiser for the same enforcement goal; more IDE-immediate (red squiggles) but requires an explicit "elements" config per layer.

---

## When to skip this (caveat worth preserving)

Multiple independent sources (Marco Lenzo, Abdulrahman Mohamed's own title, the general Clean/Onion literature) converge on the same warning: **don't apply full Onion layering to a genuinely thin CRUD-over-one-table module.** The extra repository interface, DTO mapping, and layer indirection cost real time and add files without adding safety when there's no real business logic to protect. `SKILL.md` should state this as an explicit escape hatch — the rule to *always* keep is the dependency direction (routes don't touch Drizzle, `service.ts` doesn't touch Fastify); the rule that's *conditional on real complexity* is how many discrete layers/interfaces a given module needs.

---

## Sources (bibliography)

1. Jeffrey Palermo — The Onion Architecture: part 1 — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
2. NDepend Blog — Onion Architecture: Going Beyond Layers — https://blog.ndepend.com/onion-architecture-layers/
3. ResearchGate (PDF) — Onion Architecture Used in Software Development — https://www.researchgate.net/publication/371006360_Onion_Architecture_Used_in_Software_Development
4. Serhat Alaftekin (Medium) — Onion Architecture: A Comprehensive Guide — https://medium.com/@serhatalftkn/onion-architecture-a-comprehensive-guide-for-modern-applications-940f007d0218
5. Methods & Tools — Chop Onions Instead of Layers — https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php
6. Marco Lenzo — The Onion Architecture explained — https://marcolenzo.eu/the-onion-architecture-explained/
7. Official CTO — Onion Architecture Pattern — https://officialcto.com/interview-section/architectural-design-patterns/onion-architecture
8. theCodeReaper — The Onion Architecture — https://thecodereaper.com/2020/05/02/the-onion-architecture/
9. Number Analytics — Mastering Onion Architecture — https://www.numberanalytics.com/blog/mastering-onion-architecture
10. DEV Community (sardarmudassaralikhan) — Onion Architecture Used in Software Development — https://dev.to/sardarmudassaralikhan/onion-architecture-used-in-software-development-4ao0
11. GitHub topics — onion-architecture (TypeScript) — https://github.com/topics/onion-architecture?l=typescript
12. GitHub — JeffMangan/typescript-onion — https://github.com/JeffMangan/typescript-onion
13. GitHub — Melzar/onion-architecture-boilerplate — https://github.com/Melzar/onion-architecture-boilerplate
14. Sankhadip Samanta (Medium) — Onion Architecture in Node.js with TypeScript — https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391
15. Remo Jansen (dev.to) — Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS — https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
16. GitHub — mike-yuen/house-express — https://github.com/mike-yuen/house-express
17. Wolk Software — Implementing SOLID and the Onion Architecture (mirror) — http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs
18. dormoshe.io — same article, mirror — https://dormoshe.io/daily-news/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad-315
19. Rup Singh (Medium) — Stop Confusing Clean, Onion, Hexagonal Architecture — https://medium.com/@rup.singh88/stop-confusing-clean-onion-hexagonal-architecture-heres-when-to-use-each-692079e56267
20. GitHub — borjatur/clean-architecture-fastify-mongodb — https://github.com/borjatur/clean-architecture-fastify-mongodb
21. Hexagonal architecture (Wikipedia) — https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)
22. generalistprogrammer.com — Clean Architecture Guide: Layers, Dependency Rule & vs Onion — https://generalistprogrammer.com/tutorials/clean-architecture-complete-guide
23. borjatur.com — Yet another vision of Clean Architecture — https://borjatur.com/2023/03/07/yet-another-vision-of-clean-architecture/
24. dev.to (dev_tips) — Hexagonal vs Clean vs Onion, which survives your app in 2026 — https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f
25. Abdulrahman Mohamed (Medium) — The Repository Pattern: A Necessary Abstraction or Over-Engineering? — https://medium.com/@abied.abiad/the-repository-pattern-your-gateway-to-clean-data-c72235f34916
26. Goca Blog — Mastering the Repository Pattern in Clean Architecture — https://sazardev.github.io/goca/blog/articles/mastering-repository-pattern
27. vimulatus (Medium) — Repository Pattern in Nest.js with Drizzle ORM — https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae
28. Cosmic Python — The Repository Pattern (chapter 2) — https://www.cosmicpython.com/book/chapter_02_repository
29. Klaviyo Engineering — The Repository Pattern — https://klaviyo.tech/the-repository-pattern-e321a9929f82
30. João Batista da Silva (Medium) — Transactions with DDD and Repository Pattern in TypeScript, Part 2 — https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901
31. Paul Serban — Drizzle ORM Best Practices: Principles, Patterns, and Real-World Case Studies — https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/
32. dependency-cruiser (GitHub) — https://github.com/sverweij/dependency-cruiser
33. eslint-plugin-boundaries — https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md

---

## Open tradeoffs / disagreements

- **Onion vs. Hexagonal vs. Clean naming.** All three sources-clusters (sections 1–2) agree on the same underlying Dependency Rule but disagree on vocabulary and emphasis: Onion/Clean think in concentric *rings* around a domain; Hexagonal thinks in *ports and adapters* with no ring geometry implied. This repo's `server/` already mixes both idioms (ringed module layers + hexagonal adapter ports) — `SKILL.md` should not force a single vocabulary, just enforce the shared rule.

- **Whether to add a DI container library.** Every general Node/TS Onion tutorial found (section 3) reaches for a decorator-based IoC container (InversifyJS). This repo already has a working, hand-rolled container (`src/platform/container.ts`) with its own port+prod+mock convention, documented in `server/docs/architecture.md`. Adopting a tutorial's IoC library would create two competing DI mechanisms in the same codebase — the skill must explicitly reject this, even though it contradicts what most Node-specific Onion writing recommends by default.

- **How much repository abstraction is warranted.** Multiple sources (Marco Lenzo, Abdulrahman Mohamed's own title, the general Clean/Onion caveats) call full repository-interface + DTO-mapping layers overkill for thin CRUD modules, while the Drizzle-specific sources (vimulatus, Paul Serban) treat mapping Drizzle rows to domain shapes as a default best practice. This repo's actual `ReviewRepository` currently returns raw Drizzle-inferred row types in places — not wrong today (single consumer, small app), but a live tension the skill should surface as a judgment call tied to module complexity, not a hard requirement everywhere.

- **Repository pattern's real payoff is debated.** Cosmic Python argues the classic justification ("swap your database vendor later") rarely materializes in practice, and the pattern's actual value is a mockable seam for tests plus a single choke point for cross-cutting concerns (Klaviyo's caching/instrumentation story). This matters for how the skill *justifies* the repository layer to a future reader — sell it on testability and a single seam, not on hypothetical vendor portability.
