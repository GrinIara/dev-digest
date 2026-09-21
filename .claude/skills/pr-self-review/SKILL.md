---
name: pr-self-review
description: "Runs a manual pre-PR hygiene check on this repo's own local changes (staged, unstaged, untracked files, plus commits already made on the current branch since main) before opening a pull request. Invoke with /pr-self-review, or when asked to review my PR/changes/diff before pushing or opening a PR. Categorizes touched files by package, dynamically dispatches to the eligible domain skills (security, backend-onion-architecture, frontend-ui-architecture, etc., resolved from .claude/skills/README.md's Scope column), aggregates and dedupes findings by severity, and reports via the ReportFindings tool. Refuses to run git push or gh pr create on the user's behalf while unresolved Critical findings exist, unless the user explicitly overrides. Unrelated to the in-app reviewer-agent feature described in docs/agent-prompts/ — this skill reviews this repo's own working tree, not a PR inside the product."
---

# PR Self-Review

Manual, on-demand hygiene check on **this repo's own local changes**, run before opening a PR. It is invoked explicitly by the user (`/pr-self-review`, or "review my PR before I open it") — it never auto-triggers. This is unrelated to the in-app "reviewer agent" feature documented in `docs/agent-prompts/`; that mechanism reviews PRs stored in this product's own database. This skill reviews *this repo's* uncommitted/branch changes before you push them.

## 1. Compute the diff scope

The diff scope is the union of:

- `git status --porcelain` — staged, unstaged, and untracked files.
- `git diff $(git merge-base main HEAD)...HEAD` — commits already made on the current branch.

The second command matters because, per this repo's root `CLAUDE.md`, `main` is the course-starter baseline and lesson/homework work happens on branches/forks, not on `main` — so a branch's own commits since it diverged are still "local changes" that haven't been through a PR review yet.

Exclude the following from **content** review — list them as touched (so the diff summary is honest about scope) but do not read or critique their contents:

- Lockfiles: `pnpm-lock.yaml`, `package-lock.json` (or equivalent, wherever they appear across the five packages).
- Generated migration metadata: `server/src/db/migrations/meta/*.json`.

## 2. Categorize touched files by package

Bucket every touched file into `client/`, `server/`, `reviewer-core/`, `e2e/`, or `other` (root config, `docs/`, `.claude/`, etc.). This bucketing drives both which skills are eligible (step 3) and which files/hunks get handed to each skill (step 4).

## 3. Resolve eligible skills — dynamically, not from a hardcoded list

Do not bake today's skill catalog into this file — skills get added later and a static table would silently drift out of date. At invocation time:

1. Read `.claude/skills/README.md`'s catalog table and note each skill's current `Scope` column value (`Backend` / `Frontend` / `Full-stack` / `Shared`).
2. Read each candidate skill's own frontmatter `description` to sanity-check it's actually a code-quality/architecture/security rubric, not a process or tooling skill.
3. Apply this mapping based on which package buckets (from step 2) are non-empty:
   - Any file under `client/**` → skills scoped `Frontend` or `Full-stack` are eligible.
   - Any file under `server/**` or `reviewer-core/**` → skills scoped `Backend` or `Full-stack` are eligible.
   - Any file under `e2e/**` → only `Full-stack`-scoped skills are eligible.
4. Denylist — never treat these as review rubrics even if scope-matched, regardless of what the README says: `engineering-insights`, `mermaid-diagram`. Both are `Shared`-scope process/documentation skills, not code-review criteria.
5. Also exclude `pr-self-review` itself from its own eligible set.

For example, a diff touching only `server/src/modules/reviews/**` would resolve today to `backend-onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` (Backend) plus `zod`, `typescript-expert`, `security` (Full-stack) — but re-derive this from `README.md` on every run rather than trusting this example, since the catalog will grow.

## 4. Invoke each eligible skill, scoped to its relevant files

For each eligible skill, invoke it via the `Skill` tool, handing it only the files/hunks from the diff that fall in its domain — e.g. give `backend-onion-architecture` only the `server/` + `reviewer-core/` portion of the diff, not the whole thing; give `frontend-ui-architecture` only the `client/` portion. `Full-stack`-scoped skills (`security`, `zod`, `typescript-expert`) may need the whole diff, since concerns like secrets or type-safety can appear in any package.

## 5. Normalize each skill's findings

Convert every skill's output into a common shape before aggregating:

```
{ skill, file, line?, severity, summary }
```

Map each skill's own vocabulary onto the four-point severity scale below (`critical | major | minor | nit`) — don't invent a fifth bucket.

## 6. Aggregate, dedupe, and report

- Dedupe by `(file, line, summary)`: when two skills flag essentially the same spot, collapse into one finding and note both contributing skills rather than reporting it twice.
- Report the aggregated, deduped findings via the `ReportFindings` tool — pass a `findings` array of `{file, summary, failure_scenario, line?, category?, severity, ...}`, ordered Critical first, and an appropriate `level`.

## Severity rubric

- **Critical (blocks)**: a security vulnerability per the `security` skill's OWASP checklist; secrets/credentials appearing in the diff; broken auth/authz; a destructive migration without safeguards; an onion-architecture dependency-direction violation; a breaking API/contract change with no compensating update.
- **Major / Minor / Nit**: advisory only — worth surfacing in the report, but none of these block on their own.

## Blocking is behavioral, not something the OS enforces

Claude Code cannot literally prevent `git push` or `gh pr create` from executing — there is no OS-level lock to reach for. Instead: while any Critical finding from step 6 remains unresolved, refuse to run `git push` or `gh pr create` on the user's behalf. Only proceed if the user explicitly overrides after being shown the Critical findings again at the moment of the override — don't silently proceed on an earlier acknowledgment.
