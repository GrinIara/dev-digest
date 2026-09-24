# Architecture decision records

One file per decision: `NNNN-kebab-title.md`, numbered sequentially, in a minimal [MADR](https://adr.github.io/madr/) format.

- An ADR starts as `proposed` and becomes `accepted` once a maintainer approves it.
- Accepted ADRs are immutable. To change a decision, write a new ADR and set the old one's status to `superseded by NNNN` — that status line is the only allowed edit.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-docs-taxonomy.md) | Docs taxonomy: Diátaxis-lite + ADRs | accepted | 2026-09-23 |

## Template

```markdown
# NNNN — <decision title>

- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context and problem

<What forces the decision? Link the plan, issue or code that raised it.>

## Considered options

1. <option>
2. <option>

## Decision outcome

Chosen: <option>, because <reason>.

## Consequences

- Good: <…>
- Bad: <…>
```
