---
name: workflow-retro
description: "Retrospective of a finished multi-agent run in this repo (spec-creator → implementation-planner → /implement, the Traced chain, or any session that spawned subagents): tokens, agent count, launch order, durations, resumes, friction (failed tool calls, hook denials), duplicated context, what was hard / easy / missed, and how the orchestrator briefed. Default depth uses what is already in the conversation (task notifications, agent reports, user answers); `deep` also parses the session transcripts with a bundled script. Replies in chat and appends one entry to docs/retro/ledger.md, with scored findings and numbered proposals for agent prompts, hooks and skills — never applies them itself. Invoke with /workflow-retro [deep] [session-id] [--since <ISO time>] [label]."
disable-model-invocation: true
argument-hint: "[deep] [session-id] [--since <ISO-8601>] [label]"
---

# /workflow-retro — how did the multi-agent run go?

**Manual only.** Runs only when the user types `/workflow-retro` (`disable-model-invocation: true`). Never start it yourself — not at the end of `/implement`, a Traced chain or any other workflow, not from a hook, not because a session "looks finished". At most, mention once that it exists.

You are the **reviewer of the run, not of the product**. Output: a summary in chat + one appended entry in the ledger. You **analyse and propose**; you never edit agent prompts, hooks, skills, `AGENTS.md` or `CLAUDE.md` in this skill — the user picks proposals and they are applied in a normal editing step afterwards.

Arguments: `$ARGUMENTS`

## 1. Scope and depth

- **Run**: this session by default. `--since <ISO>` limits it to one workflow when the session held several; otherwise cover the whole session and say so. **Label**: the plan/spec slug (e.g. `project-context`), inferred from agent descriptions or plan/spec paths; ask only if it can't be.
- **Depth**:
  - **in-context (default)** — use only what the conversation already holds. No transcript parsing.
  - **`deep`** — additionally run the collector (§3). Forced when a **different session id** is given, or when the current conversation was compacted and the details are gone (say which).

## 2. In-context data (always)

Gather from the conversation, citing where each fact came from:
- **Agents and order**: every `Agent` call in order — type, description, parallel or not, background or not; every `SendMessage` continuation and its reason; agents stopped by the user.
- **Cost & time**: each task-completion notification's `<usage>` (`subagent_tokens`, `tool_uses`, `duration_ms`). Sum them; the main session's own tokens are not in these — say so (in-context), or take them from `deep`.
- **Agents' own words**: each final report — its stated blockers, questions, assumptions, "could not find", deviations.
- **User gates and corrections**: every question put to the user, the answer, and every time the user **overruled** an agent or you (the most valuable signal). Also instructions the user had to repeat.
- **Orchestrator's briefs**: were they self-contained (images described or paths given, decisions stated, what not to do)? Were answers relayed verbatim?
- A `docs/plans/*.trace.md` for this run, if present: reuse its figures.

## 3. Deep data (`deep` only)

Run `.claude/skills/workflow-retro/scripts/collect.sh <session-id | path.jsonl> [--since <ISO>]` (session id of the current run: the JSONL name under `<config dir>/projects/<cwd-slug>/`; config dir is `$CLAUDE_CONFIG_DIR`, else `~/.claude`; layout in `.claude/agents/README.md` → *Trace*). It prints: main-session usage; per agent in launch order — type, depth, stopped-by-user, model, messages, output/cache tokens, start/end, minutes, resumes, tool calls; tool mix; friction (failed tool calls and hook denials, counted); files read by several agents; files re-read ≥3 times in one agent.

**Never `cat`/`Read` a raw transcript** — they are megabytes. For anything else use a narrow `jq` and cap output, e.g. an agent's handoff and its brief:

```bash
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="SubagentHandback") | .input | tostring' <agent>.jsonl | head -c 6000
jq -r 'select(.type=="user" and (.message.content|type)=="string") | .message.content' <agent>.jsonl | head -c 3000
```

Dollar cost only with prices fetched from the official pricing page during this run (recipe: `.claude/agents/README.md` → *Trace*); otherwise report tokens.

## 4. Analyse

Every point needs evidence (a notification, a metric, a quoted report line, a user message). No evidence → "not observed", never a guess.

1. **Cost & shape** — total tokens (agents; main too when `deep`), the most expensive agent and why, wall-clock and critical path, parallelism used vs possible.
2. **Difficulties** — blockers and questions an agent raised, hook denials and failed reads (`deep`), retries, agents stopped by the user, fix-loop iterations.
3. **Went easily** — agents that finished in one pass; which input made that possible (precise brief, a spec, file:line pointers).
4. **Duplication** — context re-derived by a later agent (files re-read across agents in `deep`), the orchestrator re-verifying what an agent already proved, content repeated between reports.
5. **Misses** — what the user or a later agent had to add or correct; claims in a report that turned out wrong; plan items or ACs that slipped.
6. **Orchestration** — brief quality, verbatim relays, continuation vs fresh agent, right agent type/model for the job (e.g. a heavy model on a mechanical check → `mechanical-checker`), questions that could have been batched into one gate.

Score each agent 1–5 on **Outcome** (survived the user's review unchanged?), **Efficiency** (tokens/minutes for what it produced), **Autonomy** (questions and corrections needed), **Handoff** (could the next step act on it without re-reading code?), one line of justification each.

## 5. Ledger

Append to `docs/retro/ledger.md` (create it with a `# Workflow retro ledger` heading and a one-line purpose if missing). Never rewrite past entries — except flipping a proposal's status when the user reports it applied. Newest entry at the bottom:

````markdown
## <YYYY-MM-DD> · <label> · <in-context | deep>
Session <id> · Scope: <whole session | since …>

| # | Agent | Model | Tokens | Tool uses | Min | Resumes | Stopped | O | E | A | H |
|---|---|---|---|---|---|---|---|---|---|---|---|
Totals: agents <n> · agent tokens <t> · main <t or "n/a (in-context)"> · wall-clock <min>

**Findings**
- Difficulty: … — evidence: …
- Went well: …
- Duplication: …
- Missed: …
- Orchestration: …

**Proposals**
| ID | Target file | Change (exact text or diff) | Fixes | Status |
|---|---|---|---|---|
| R<date>-1 | .claude/agents/<x>.md | … | Difficulty 1 | proposed |

**Module insights** (product/codebase lessons from this run, per module — they live here, not in a module's `Insights.md`)
- `server/` — …
- `client/` — …

**Follow-up on earlier proposals**: <for each `applied` proposal in earlier entries whose target ran again in this run — did the problem recur? yes / no / not observable>
````

Proposal IDs are `R<YYYYMMDD>-<n>`; status is `proposed` → `applied` / `rejected` (set when the user says so). Before writing, read the ledger's earlier entries: compare this run's per-agent-type tokens and minutes with past runs of the same type and note regressions in Findings.

## 6. Hand back in chat

5–10 lines: totals, the per-agent scorecard in one compact table, top 3 findings, top 3 proposals (ID + target file), the ledger path. Ask which proposal IDs to apply; do not apply them within this skill.
