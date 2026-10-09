---
name: dependency-checker
description: "Audits the npm dependencies of every package in this repo (server, client, reviewer-core, e2e, mcp-server, evals, plus vendored shared code) and writes a structured report to docs/reference/dependencies-report.md: a Mermaid map of packages and their internal links, per-package tables of each dependency's type, installed version, on-disk size and transitive weight, outdated versions, known vulnerabilities (npm/pnpm audit), lockfile/package-manager drift, version drift between packages and unused-dependency candidates, ending with a prioritised P0–P3 action list and concrete advice. Use whenever someone asks to check, audit, analyse, map or clean up dependencies or node_modules, asks which packages are heavy/outdated/vulnerable/unused, why install is slow or node_modules is big, whether to upgrade something, or wants a dependency graph or report — even if they don't say 'dependency checker'. Reports only: it never edits package.json or lockfiles, installs, or runs audit fix."
---

# Dependencies Checker

Produces one developer-facing report on the npm dependencies of this repo. The
report answers four questions in this order, because that's the order a
developer acts in: **what's there** (map + inventory), **what it costs** (size),
**what's wrong** (vulnerable, outdated, drifted, unused) and **what to do first**
(prioritised actions).

The work splits cleanly: a script collects facts deterministically, you interpret
them. Don't re-derive what the script already measured, and don't present the
script's heuristics as facts without checking them (step 3).

## Repo facts that shape the analysis

- Six independent packages, each with its own `package.json` + lockfile. There is
  no workspace tooling, so the **same library is installed separately per
  package** — duplication across packages is by design, not a finding. Version
  *drift* between them (e.g. two majors of `zod`) is a finding.
- Cross-package code sharing is through **tsconfig `paths` aliases**, not npm
  deps (`@devdigest/reviewer-core`, `@devdigest/shared`). `server/src/vendor/shared`
  has no `package.json`; `client/src/vendor/{shared,ui}` are vendored copies.
  These go on the map as internal edges, not in the dependency tables.
- Lockfiles are mixed: some packages use `pnpm-lock.yaml`, some `package-lock.json`.
  That alone is fine. A package whose lockfile belongs to one manager while its
  `node_modules` was installed by another (`lockfileDrift: true`) is a finding —
  the installed tree may not match what CI installs.
- `server/clones/**` contains other people's repositories and `client/.next/**` is
  build output. The script excludes them via git; keep them out of the report too.

## Workflow

### 1. Collect

```bash
node .claude/skills/dependency-checker/scripts/collect-deps.mjs \
  --out <scratchpad>/deps.json            # add --offline to skip the network
```

Write the JSON to the session scratchpad (or `/tmp`), never into the repo. Online
mode runs `outdated` + `audit` per package via the manager that owns its lockfile
and takes a few minutes; offline takes ~15 s. If the user didn't ask otherwise, run
online — vulnerabilities and outdated majors drive most of the prioritisation. If
network calls fail, the script records a warning and carries on; say in the report
which sections are missing and why.

The JSON shape, per package: `path`, `name`, `lockManager`, `installedWith`,
`lockfileDrift`, `nodeModulesBytes`, `counts`, `deps[]` (`name`, `kind`
prod/dev/peer/optional, `spec`, `installedVersion`, `ownBytes`, `closureBytes`,
`closurePackages`, `deprecated`, `license`, `referencedInSource`), `outdated[]`,
`audit{counts, items[]}`. Top level: `internalEdges[]`, `sharedDeps[]`
(`majorDrift`), `warnings[]`.

If a package has `hasNodeModules: false`, sizes are unknown — say "not installed",
don't guess, and suggest installing only if the user wants sizes for it.

### 2. Classify each dependency

`kind` (prod/dev/peer/optional) comes from `package.json`. Add a **role** so a
reader can scan the tables by purpose. Use these roles, picking the closest:

| Role | Examples |
|---|---|
| framework | next, react, fastify |
| data | drizzle-orm, pg, pgvector |
| validation | zod |
| ai/llm | openai, @anthropic-ai/*, @modelcontextprotocol/sdk |
| ui | lucide-react, tailwindcss, mermaid |
| build/tooling | typescript, tsx, drizzle-kit, postcss |
| test | vitest, @playwright/test, testcontainers |
| lint/format | eslint, prettier |
| types | @types/* |
| util | everything else |

Flag a **misplaced kind** when a build/test/lint/types package sits in
`dependencies` of a package that's deployed (server, client, mcp-server), or a
runtime import sits only in `devDependencies` — the first bloats production
installs, the second breaks them.

### 3. Verify the heuristics before reporting them

`referencedInSource: false` means a cheap grep found no import, config mention or
script call. It's a **candidate**, not a verdict. Before listing it, check:

- is it a peer of something that is used? (`postcss` for `@tailwindcss/postcss`)
- is it pulled in by a scoped sibling? (`testcontainers` vs `@testcontainers/postgresql`)
- is it invoked by `npx`/a CI workflow/a shell script under `scripts/`?
- is it loaded by string at runtime (plugins, autoload, dynamic `import()`)?

Grep for it yourself (`grep -rnE --exclude-dir=node_modules --exclude-dir=clones
"<name>" <package> .github scripts` — `rg` isn't guaranteed to be installed). Report what you
found in a "why" column: "no import found; only peer of X" reads very differently
from "no reference anywhere". Drop items you've confirmed are used.

Treat sizes the same way: `closureBytes` overlaps between deps (two packages
sharing a transitive dep each count it), so closures don't sum to
`nodeModulesBytes`. Say this once under the size table.

### 4. Prioritise

Read `references/prioritization.md` and assign every finding a P0–P3 using its
rubric. Each action must name the package path, the dependency, the evidence
(version, CVE/advisory, size, file:line) and a concrete next step (exact command
or edit). An action without evidence or a next step isn't useful — leave it out
or fold it into another one.

### 5. Write the report

Read `references/report-template.md` and fill it in at
`docs/reference/dependencies-report.md` (create `docs/reference/` if missing).
If a previous report exists there, read it first and fill the **Changes since last
run** section — trends are often the most useful part for a recurring check. Then
overwrite it; the history lives in git.

### 6. Reply in chat

Give a short summary: where the report is, the counts per priority, the top 3
actions, and any section that's incomplete (offline, failed audit, package not
installed). Don't paste the whole report.

## Boundaries

This skill reports; it doesn't change dependencies. Don't run `install`, `update`,
`audit fix`, `dedupe` or edit `package.json`/lockfiles — upgrades in this repo cross
package boundaries and need a deliberate decision. If the user then asks to act on
the report, treat that as a separate task.
