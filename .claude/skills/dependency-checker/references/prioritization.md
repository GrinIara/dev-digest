# Prioritisation rubric

Every finding gets exactly one priority. The axis that matters most is **reach**:
does the problem ship to users (a `prod` dependency of a deployed package —
`server`, `client`, `mcp-server`, and `reviewer-core` because `server` imports it
via alias), or does it only live on a developer machine / CI runner (`dev` deps,
and every dependency of `e2e` and `evals`)? The same advisory is P0 in one place
and P2 in another.

Use `audit.items[].inProd` and `reachedVia` from the collector for reach. When
`reachedVia` is empty, the vulnerable package arrives through a peer or an
unresolved path — run `pnpm why <name>` / `npm explain <name>` in that package
before assigning reach, and say which you used.

## Levels

| Priority | Meaning | Typical findings |
|---|---|---|
| **P0 — now** | Exploitable risk in what ships, or something that breaks installs/builds. Fix before the next deploy. | critical/high advisory with `inProd: true`; deprecated prod package with a known security notice; runtime import declared only in `devDependencies` of a deployed package |
| **P1 — this sprint** | Real risk or cost with a clear fix, but not an emergency. | moderate advisory in prod; critical/high advisory dev-only but in a dev server/tool exposed to the network (vite, esbuild dev server); `lockfileDrift`; a major-version drift of the same library between packages that share types through aliases (e.g. `zod` in `server` vs `reviewer-core`); prod dep ≥ 2 majors behind; build/test tooling in `dependencies` of a deployed package |
| **P2 — planned** | Hygiene and weight. Worth a ticket. | confirmed unused dependency; heavy dependency (top-3 `closureBytes` in a package, or > 50 MB) with a lighter alternative or that could be lazy-loaded; dev-only high/critical advisory without network exposure; prod dep 1 major behind; deprecated dev package |
| **P3 — note** | Low value or informational. List, don't push. | minor/patch updates; low advisories; licence notes; unused *candidates* you couldn't confirm either way |

## Tie-breakers and adjustments

- **Fix availability moves things.** An advisory whose fix is a patch/minor bump
  in a direct dependency is cheap — keep the level but put it first within it. A
  fix that needs a semver-major of a framework (`next`, `fastify`, `vitest`) needs
  a plan; say so and estimate the blast radius (which packages, which aliases).
- **Group by root cause.** Ten advisories that all come from `vitest → vite →
  esbuild` are one action ("bump vitest in reviewer-core, mcp-server, evals"), not
  ten. Count the advisories in the evidence, prioritise the action once.
- **Cross-package actions go together.** If the same upgrade is needed in several
  packages, write one action listing all of them — they're installed separately
  but should move in lockstep because of the shared-types aliases.
- **Don't inflate.** If nothing qualifies as P0, say "No P0 findings". An empty
  level is useful information; a padded one teaches readers to ignore the report.

## Writing an action

Each action is one row:

| Field | Content |
|---|---|
| ID | `P1-3` (priority + running number) |
| Package(s) | `server`, `reviewer-core` |
| Dependency | `simple-git` 3.x |
| Finding | what's wrong, in one line |
| Evidence | advisory ID/URL, installed vs latest version, size, or file:line |
| Next step | exact command or edit, e.g. `cd server && pnpm add simple-git@^3.32` |
| Effort | S (< 1 h, no code changes) · M (code changes in one package) · L (cross-package or breaking upgrade) |
