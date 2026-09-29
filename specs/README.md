# Specs — cross-package

Spec-Driven Development specs for features that touch **more than one package**
(`client/`, `server/`, `reviewer-core/`, `e2e/`, `mcp-server/`) — for example, a
new API endpoint together with the page that uses it. Only such specs live here.

A spec that concerns a single package goes into that package's own
`<package>/specs/` folder instead.

## Rules

- One file per feature: `SPEC-<YYYY-MM-DD>-<kebab-slug>.md` — the creation
  date plus a short feature name. The file name is the Spec ID and is unique
  across this folder and every `<package>/specs/`.
- Specs are written in English.
- Specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md)
  agent (or by hand) with the fixed template: problem and user, goals /
  non-goals, user stories, EARS acceptance criteria, edge cases,
  optional workflows and contracts, non-functional requirements, inputs and
  provenance, untrusted inputs, open questions, optional design analysis.
  User stories carry a MoSCoW priority; each acceptance criterion names how it
  is verified (`unit` / `integration` / `e2e` / `manual`).
- A spec says *what* and *why*: workflow and service-communication diagrams
  and interface-level contracts (endpoints, fields, error cases) are welcome;
  implementation details (files, functions, DB design, libraries, tasks) are
  not — those belong in the plan.
- Chain: `spec-creator` writes a `draft` → a person approves it →
  `implementation-planner` takes the approved spec as input and writes the
  plan in `docs/plans/`.
- Lifecycle: `draft` → `approved` → `implemented`. Only a person moves a spec
  out of `draft`: to `approved` after review, and to `implemented` once
  `plan-verifier` reports `ready for implemented` (every AC Met, Deferred or
  verified by hand) — the person updates both the spec's `Status:` line and
  its index line below. No agent changes a spec's status. An approved or
  implemented spec is never rewritten — a new
  spec with `Supersedes: <Spec ID>` replaces the decision.

## Index

<!-- One line per spec: - [SPEC-YYYY-MM-DD-slug — Title](SPEC-YYYY-MM-DD-slug.md) — status -->
- [SPEC-2026-09-29-project-context — Project Context: attach repo Markdown docs to agents and skills](SPEC-2026-09-29-project-context.md) — approved
