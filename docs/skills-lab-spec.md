# Skills Lab — implementation specification

Generated 2026-09-21. Consolidates a design session covering two related but
separate deliverables: (1) the **Skills Lab** product feature (skills as
reusable prompt blocks bound to reviewer agents, per course "Частина 2"), and
(2) **`pr-self-review`**, a Claude Code skill for this repo's own `.claude/skills/`.
Grounded against the actual codebase as of this date — not a greenfield design,
most of the data layer already exists as course scaffolding on `main`. This is
a planning document; nothing described here has been implemented yet.

## How to read this

- **"Already exists"** — verified in code, do not re-build, just wire up / reuse.
- **"New"** — needs to be built.
- **Decided** — a design call was made explicitly in this session; implement as stated.
- **Open** — flagged but not yet answered; confirm with the user before building that piece.

---

## Part A — Skills Lab (product feature)

### A.1 — Already built (verified, do not re-spec)

| Layer | What exists | Where |
|---|---|---|
| DB | `skills`, `skill_versions`, `agent_skills` (agentId, skillId, order) | `server/src/db/schema/skills.ts`, `agents.ts:51-63` |
| DB | `eval_cases`, `eval_runs` (`owner_kind: 'skill'\|'agent'`, pass/recall/precision/citationAccuracy/durationMs/costUsd) | `server/src/db/schema/eval.ts` |
| DB | `findings.accepted_at` / `dismissed_at`, `findings.category` (`bug\|security\|perf\|style\|test`) | `server/src/db/schema/reviews.ts` |
| DB | `agent_runs.cost_usd`, `.duration_ms`, `.findings_count` | `server/src/db/schema/runs.ts` |
| Contracts | `Skill`, `SkillType` (`rubric\|convention\|security\|custom`), `SkillSource` (`manual\|imported_url\|extracted\|community`), `AgentSkillLink`, `AgentVersionConfig.skills` | `server/src/vendor/shared/contracts/knowledge.ts` (mirrored in `client/src/vendor/shared/`) |
| Agent↔skill binding API | `GET/POST /agents/:id/skills`, `service.setSkills/linkSkill/unlinkSkill`, ordered | `server/src/modules/agents/{routes,service,repository}.ts` |
| Prompt assembly | `PromptParts.skills` / `ReviewInput.skills` → rendered as untrusted `## Skills / rules` block, appended after the system prompt | `reviewer-core/src/prompt.ts:54-59,104-127`, `review/run.ts:55-56` |
| Trace | `run_traces.trace.prompt_assembly.skills` already stores the rendered skills block; `TraceBody.tsx` already renders it as its own block | `client/.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:75-76`, `client/src/vendor/shared/contracts/trace.ts` |
| Markdown render | `react-markdown` + `remark-gfm` already vendored | `client/src/vendor/ui/primitives/Markdown.tsx` |
| Model listing | Per-provider `listModels()` on each LLM adapter, `ModelInfo { id, pricing?, contextLength? }` | `server/src/adapters/llm/{openai,anthropic}.ts`, `modules/agents/routes.ts:171` |
| Existing agents | General Reviewer, Performance Reviewer, Security Reviewer, **Test Quality Reviewer** (already created — confirmed live in the Agents UI, `deepseek/deepseek-v4-flash`, enabled) | seeded / created already |

**The one critical existing gap:** `server/src/modules/reviews/run-executor.ts:427` hardcodes `skills: null`. No run today actually resolves and sends an agent's linked skills, even though every other layer is ready. **Fixing this line is the single highest-priority task** — until it's fixed, nothing else in this spec produces observable behavior.

### A.2 — Not conflated with this feature
`PluginSkill`/`PluginAgent`/`PluginEvalCase` (`productionize.ts`) are a separate, larger plugin-bundle export/import feature (`.devdigest-plugin/`, course lesson L08). Don't reuse those contracts for the single-skill import flow below — same shape as precedent only, not the same code path.

### A.3 — Navigation
New **SKILLS LAB** section: Skills (new), Agents (existing page, re-parented here). Screenshots also show a **GLOBAL** section (Memory, Multi-Agent Review, Agent Performance, CI Runs) and a **MORE SCREENS** section (Conformance, First-run setup).

**Decided:** build real pages only for Skills and Agents.
**Open:** everything else in GLOBAL / MORE SCREENS — render as disabled/"coming soon" nav entries, or omit entirely for now? Note for whoever picks this up: `conformanceChecks` (Conformance) and `multi_agent_runs` (Multi-Agent Review) already have DB tables (other lessons' scaffolding); Conventions and Eval Dashboard (as a workspace-wide page, distinct from the per-entity Evals tab below) have no backing table at all yet.

### A.4 — Skills list page (`client/src/app/skills/page.tsx`, new)
Grid of cards, mirroring the existing `agents/_components/AgentCard` pattern: icon keyed by `type`, name, `enabled` `Toggle`, description, `type` badge, `source` badge (Manual/Extracted/Community/Imported ↔ `manual/extracted/community/imported_url` — direct enum mapping, no schema change), and a stats line `N agents · X% pull · Y% accept` (see A.6). "+ Add Skill" dropdown: **Create** / **Import**.

### A.5 — Skill detail panel — 5 tabs (`Config / Preview / Evals / Stats / Versions`)
Header: name, `type` badge, version badge, top-right **"Run on evals"** button.

- **Config** — Name* (kebab-case slug, unique per workspace — it doubles as the displayed virtual filename, e.g. `pr-quality-rubric.md`), Description, Type select, Skill body (markdown editor, live token count via the existing tokenizer adapter at `server/src/adapters/tokenizer`), `Enabled` toggle (mirrors the list-card toggle — this is the *only* enable control for a skill, see A.7).
- **Preview** — body rendered via the existing `Markdown.tsx`. No new logic.
- **Versions** — newest-first list, each with a change-summary line, date, and (except the current version) **Diff** / **Restore**.
  - **New:** `skill_versions.change_summary text` (nullable) — no existing field captures a human-authored "what changed" note; populate from an optional "describe your change" input on Save, defaulting to a generic string if left blank. *(Decided by default — not explicitly re-confirmed after being flagged; low-risk/reversible, revisit if the implementing agent wants to swap it for an auto-generated line-diff label instead.)*
  - **Diff** — plain diff between two versions' `body`; reuse the diff-rendering component that already backs the PR diff page (`e2e/specs/05-pr-diff.flow.json` confirms one exists) rather than building a new one.
  - **Restore** — copies an old version's `body` forward as a **new** version (e.g. restoring v2 while at v5 creates v6, `change_summary: "Restored from v2"`); history is never mutated.
- **Stats** — `USED BY` (agent count, from `agent_skills`), `PULL FREQUENCY`, `ACCEPT RATE`, `FINDINGS (30D)`, agents-using-this-skill list, findings-by-category **$** donut.
- **Evals** — list of `eval_cases` (`owner_kind='skill'`) with `eval_runs` history; **"Run on evals"** executes every case for this skill through `reviewPullRequest` (minimal generic system prompt + just this skill's body) and writes an `eval_runs` row.

### A.6 — Stats attribution (decided: maximize reuse, zero new columns on `findings`/`agent_runs`)
Originally proposed `findings.skill_refs` + `agent_runs.skill_ids` as new columns. **Rejected in favor of full reuse:**

- Change `wrapUntrusted('skill-${i}', ...)` in `reviewer-core/src/prompt.ts` to label each skill block by the skill's **id/name** instead of positional index (`skill:<id>` instead of `skill-0`). This is the only code change needed.
- "Which skills were pulled into a run" is then derived by checking whether `run_traces.trace.prompt_assembly.skills` contains a given skill's marker — no new column.
- Attribution is **run-level, not per-finding**: every finding produced in a run where a skill's marker appears counts toward that skill's stats. Coarser than true causal attribution (a run with two security-type skills bound double-attributes), but needed zero schema — accepted tradeoff.
- **Pull frequency (30d)** = runs (by agents linked to this skill) whose trace contains this skill's marker, ÷ all runs by those agents in the window.
- **Accept rate** = findings with `accepted_at` set ÷ findings with `accepted_at` or `dismissed_at` set, among findings from runs attributed to this skill (both columns already exist, no schema change).
- **Findings-by-category $ (decided)** = each run's single `cost_usd` split evenly across that run's findings, summed by `category` for findings attributed to this skill. Approximation, not true per-finding cost — **explicitly accepted by the user**, no longer open.
- **Net new schema for this entire feature: one column** (`skill_versions.change_summary`), plus `ModelInfo.provider` (an interface field, not a DB column — see A.9). Everything else reuses existing tables/columns.

**Why this is safe re: migrations (explained, not just flagged):** `server/CLAUDE.md`'s "Do not touch" rule means past *applied* migration files are immutable — you always add a new migration, never edit one that already ran, so an additive column is normal and low-risk. The real (soft) caveat: `main`'s schema comment states these tables were pre-built as scaffolding for a lesson the course intends to eventually land officially. If an official version ships later with its own shape for version metadata, a fork's ad hoc `change_summary` column could diverge from or collide with it, making a future rebase onto an updated `main` messier. Not a blocker — just why this was raised as a conscious decision rather than added silently.

### A.7 — Import flow
`POST /skills/import` (parse-only, returns a preview draft, does not insert):
- `.md` file → parse YAML frontmatter for `name`/`description` (same convention as `.claude/skills/*/SKILL.md`), rest of file = `body`.
- Archive (zip) → locate one markdown file inside (e.g. `SKILL.md` or the only root `.md`), read its **text only** — every other entry (scripts, binaries) is discarded unread, never executed, never written to disk outside the parse buffer.
- Client shows the parsed draft in a preview panel with a trust warning ("this becomes another party's instructions inside this agent's prompt") before confirm. Confirm calls `POST /skills` with `source: 'extracted'`.

### A.8 — Backend module plan
- **New** `server/src/modules/skills/` (`routes.ts` + `service.ts` + `repository.ts`, workspace-scoped, mirrors `modules/agents/`): `GET /skills`, `GET /skills/:id`, `POST /skills`, `PATCH /skills/:id` (bumps `version`, writes a `skill_versions` row + `change_summary`), `DELETE /skills/:id` (cascades `agent_skills`), `POST /skills/import` (A.7), `GET /skills/:id/token-count` (or client-side, reusing the tokenizer adapter).
- **New** `server/src/modules/eval/` — **owner-agnostic** (`owner_kind: 'skill'|'agent'`), so it serves both the Skill Evals tab and the Agent Evals tab (A.10) from one implementation: CRUD over `eval_cases` + a run action writing `eval_runs`.
- **Fix** `run-executor.ts:427` — resolve the agent's `skillLinks()` (already exists), filter `enabled`, map to `.body`, pass as `skills` instead of `null`.

### A.9 — Agent detail panel — 6 tabs (`Config / Skills / Context / Evals / Stats / CI`)
Mostly a reshuffle of fields that already exist on `Agent` (`ConfigTab.tsx` today has all of these flat in one form) — **not new backend work**, just retabbing existing fields, plus one new tab and one aggregation change:

- **Config** — name, description, **Model** (see below), system prompt (live token count *with budget*, e.g. `412 / 8,000 tokens`; caption: "Loaded as the static system message. Skills are appended below it." — documents behavior `assemblePrompt` already implements, no code change), output schema, `Enabled` toggle. `strategy` (single-pass/map-reduce/auto) has no obvious tab of its own in this design — proposed to stay in Config under an "Advanced" disclosure.
  - **Decided:** Model becomes a single **cross-provider** picker (no separate Provider dropdown), confirmed by the user. Implementation: extend `ModelInfo` with `provider: Provider`; add an aggregating call that fetches `listModels()` from all three adapters and merges into one list, tolerating individual provider failures (same "no key configured → empty" degradation `ConfigTab.tsx` already has). `model-label.ts`'s `modelLabel`/`toModelOptions` need the provider folded into the label for disambiguation (e.g. `openai · gpt-4.1 — $…`) since model ids aren't unique across providers. On selection, `provider` is derived from the chosen item's tag; the `Agent` contract and `PATCH` payload are unchanged (still sends both `provider` and `model`) — purely a client-side selection UX change plus one small server-side aggregation addition.
- **Skills** — **fully backed by existing endpoints, no new backend work.** Lists *every* workspace skill (not just bound ones) with a drag handle, a checkbox (checked = bound to this agent), and its `type` badge; header shows "`N of M enabled`" (this wording means *bound*, not the skill's own global `enabled` — keep that distinction in the UI copy, don't build a second enable control); caption: "Order matters — earlier skills appear earlier in the assembled prompt. Drag to reorder." Checking/unchecking/reordering all resolve to one `POST /agents/:id/skills { skill_ids: [...] }` call using the endpoint that already exists. Full skill list comes from the new `GET /skills` (A.8) cross-referenced against `GET /agents/:id/skills` (already exists) for checked state.
  - **Decided (resolved by these screenshots):** no per-agent-link enable/disable column on `agent_skills` — the checkbox *is* the binding, full stop. Earlier proposal to add `agent_skills.enabled` is dropped.
- **Context** — proposed home for the existing `repo_intel` toggle.
- **CI** — proposed home for the existing `ci_fail_on` field, optionally a read-only recent-CI-runs list (`agent_runs` filtered `source='ci'` — already exists).
- **Stats** — list-card line (`142 runs · 78% accept · $0.04 avg`) and this tab's detail view are fully computable from existing columns: `agent_runs` (count, avg `cost_usd`) and `findings.accepted_at`/`dismissed_at` joined via `reviews.agent_id`. **Zero new schema** — same reuse principle as A.6.
- **Evals** — identical mechanism to the Skill Evals tab, `owner_kind='agent'` on the same tables (A.8's eval module).

### A.10 — Demo/seed data and control experiments
- **Test Quality Reviewer** — already exists (confirmed live). Bind 4 skills, one per concern: `test-branch-coverage`, `test-corner-cases`, `test-excessive-mocking`, `test-flakiness` (all `type: 'rubric'`) — **decided as 4, not 3**, specifically so the "happy-path-only PR" control experiment shows two *distinct* skill blocks lighting up (uncovered branch + missed corner case) rather than one merged block. Build 3 via the Create form; import the 4th from a fixture `.md` (e.g. `e2e/specs/fixtures/skill-test-flakiness.md`) to exercise the import path end-to-end.
- **API Contract experiment — decided: reuse an existing agent, do not create a second new one.** Bind a new `api-breaking-change-detection` skill (`type: 'convention'`) to **General Reviewer** ("reviews a PR diff for bugs, correctness, and clarity" — an unannounced breaking route-signature change is a correctness issue). Security Reviewer (secrets/injection/SSRF) and Performance Reviewer (N+1/indexes) don't fit. So the acceptance checklist's "both new agents have bound skills" resolves to: Test Quality Reviewer (new, 4 skills) + General Reviewer (existing, +1 skill).
- **Control experiments run through the Evals tab (A.5), not a manual A/B.** Each scenario is an `eval_case` on the relevant skill/agent, executed via "Run on evals" — that's the mechanism the schema (`eval_cases`/`eval_runs`) was clearly built for:
  - *Test Quality*: an `eval_case` with `input_diff` = a PR adding a test that covers only the happy path. Expect a clean/skip result with the 4 skills disabled; expect findings citing the uncovered branch *and* the missed corner case (two distinct findings) with them enabled.
  - *API Contract*: an `eval_case` with `input_diff` = a route request/response shape change with no compatibility note. Expect skip without the skill, breaking-change finding with it.

### A.11 — Open decisions (carried forward, still unresolved)
1. Nav shell scope for Conventions / Eval Dashboard / Memory / Multi-Agent Review / Agent Performance / CI Runs / Conformance / First-run setup (A.3).
2. `skill_versions.change_summary` as a real column vs. an auto-generated diff-based label (A.5) — defaulted to keeping the column; revisit if unwanted.
3. Exact placement of `strategy` (single-pass/map-reduce/auto) in the retabbed Agent Config (A.9) — proposed "Advanced" disclosure under Config, not confirmed.

---

## Part B — `pr-self-review` (Claude Code skill, separate deliverable)

A distinct artifact: a `.claude/skills/pr-self-review/SKILL.md` for reviewing **this repo's own local changes** before opening a PR — unrelated to the Skills Lab product feature above (different "skills": Claude Code skills vs. in-product reviewer-agent skills). An empty scaffold folder already exists at `.claude/skills/pr-self-review/` (no `SKILL.md` yet).

- **Manual-only, no git hook** — matches the course acceptance criterion "pr-self-review exists with auto-invoke disabled; called manually, pulled in both frontend and backend skills." Frontmatter should avoid "use proactively" language (unlike `backend-onion-architecture`/`frontend-ui-architecture`/`next-best-practices`, which use `user-invocable: false` + proactive phrasing specifically to auto-load); `pr-self-review` should NOT set `user-invocable: false`, consistent with skills like `security`/`fastify-best-practices` that are manually invoked and not auto-loaded.
- **Diff scope**: union of `git status --porcelain` (staged/unstaged/untracked) and `git diff $(git merge-base main HEAD)...HEAD` (commits already made on the branch, since `main` is the course-starter baseline). Excludes lockfiles and generated migration-meta JSON from content review.
- **Skill applicability, computed dynamically** — not a hardcoded glob table (would drift). Read `.claude/skills/README.md`'s catalog **Scope** column (Backend/Frontend/Full-stack/Shared) plus each skill's own frontmatter `description`. Mapping: `client/**` → Frontend + Full-stack skills eligible; `server/**`/`reviewer-core/**` → Backend + Full-stack eligible; `e2e/**` → Full-stack only. Explicit denylist (process/doc skills, never review rubrics): `engineering-insights`, `mermaid-diagram`. Note: `backend-onion-architecture` and `frontend-ui-architecture` are currently untracked and missing from the README catalog table — add their rows as part of this work, or the dynamic lookup misses them.
- **Execution**: compute diff → categorize files by package → resolve eligible skills → invoke each (via the `Skill` tool) scoped to its relevant files/hunks only → normalize each skill's output to `{skill, file, line, severity, summary}` → aggregate/dedupe, report via the `ReportFindings` tool already available in this environment.
- **Severity rubric (draft)**: Critical (blocks) = security vulnerability per the `security` skill's OWASP checklist, secrets/credentials in diff, broken auth/authz, destructive migration without safeguards, onion-architecture dependency-direction violation, breaking API/contract change with no compensating update. Major/minor/nit = advisory only.
- **Blocking is behavioral, not OS-level**: Claude Code can't literally prevent `git push`/`gh pr create`. The skill instructs the agent to refuse to run those commands on the user's behalf while unresolved criticals exist, requiring an explicit override to proceed.
- **Files to add**: `.claude/skills/pr-self-review/SKILL.md` (new); `.claude/skills/README.md` catalog — add a `pr-self-review` row + backfill missing rows for `backend-onion-architecture` / `frontend-ui-architecture`. **Do not touch** `skills-lock.json` (tooling-managed).
- **Verification plan**: diff touching only `client/**` → only Frontend/Full-stack skills fire; only `server/**` → only Backend/Full-stack fire; both → both fire and merge into one report; inject a deliberate critical (e.g. hardcoded secret) → confirms `BLOCKED`; clean diff with only minor issues → confirms non-blocking summary; run an unrelated normal task and confirm `pr-self-review` never auto-loads.
