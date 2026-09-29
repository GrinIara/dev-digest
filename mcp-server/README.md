# `@devdigest/mcp-server`

A local **stdio MCP server** that lets Claude Code (or any MCP client) drive
DevDigest: list reviewer agents, run one agent on a PR and get its findings in
a single call, read a finished run's verdict, read a repo's accepted
conventions, and get a PR's blast radius (impact map of changed symbols,
callers, and affected endpoints/crons) straight from the pre-built
`repo-intel` index.

It is a thin HTTP client over the running `server/` API — no direct DB,
GitHub, or LLM access, and no import of `server/`'s runtime code. See
`docs/plans/2026-09-26-mcp-server.md` §0.7 for why (in short: an in-process
import would create a second composition root and could corrupt the API's
own run/reaper state).

**This server is registered project-wide** via the root [`/.mcp.json`](../.mcp.json)
— Claude Code reads that file automatically for every session started in this
repo, so it's picked up right after cloning with no `claude mcp add` step, for
everyone on the team. `./scripts/dev.sh` still never installs, starts, or
otherwise references this package directly: a stdio MCP server isn't a
daemon, Claude Code spawns the process itself (via `bin/start.sh`) only when
a session actually calls one of its tools, and stops it when the session
ends. What `./scripts/dev.sh` *does* need to have already started is the
**DevDigest API** these tools call over HTTP (see Prerequisites). Claude Code
also asks each user to approve a new project-scoped server the first time
they use it in a given checkout — cloning the repo alone doesn't silently run
anything.

If you'd rather not use the root config (e.g. attaching only this server with
nothing else from `.mcp.json`, or debugging), see "Alternative ways to attach
it" below.

## Prerequisites

- The DevDigest API running and reachable (default `http://localhost:3001`):
  ```sh
  ./scripts/dev.sh --no-client   # Postgres + migrate + seed + API only, no web app
  ```
  (Any variant of `./scripts/dev.sh` that brings up the API works; `--no-client`
  just skips the web app, which this server doesn't need.) Every tool call
  fails fast with a clear message if the API isn't up yet.
- Node ≥ 22 (same requirement as the rest of the repo).
- This package's own dependencies, installed once:
  ```sh
  cd mcp-server && npm install
  ```

## Alternative ways to attach it

The root `/.mcp.json` covers the common case (every Claude Code session in
this repo, once approved). There's deliberately no separate
`mcp-server/mcp.json` alongside it any more — two files both registering a
`devdigest` server invited exactly the duplicate-registration confusion this
setup should avoid. Two other routes exist for cases the root config doesn't
cover:

### 1. Persistent on this machine

Registers the server locally (this machine + this repo checkout only, not
committed) so every future `claude` session in this repo offers it:

```sh
claude mcp add devdigest --scope local --transport stdio \
  --env DEVDIGEST_API_URL=http://localhost:3001 \
  -- <absolute-path-to-repo>/mcp-server/bin/start.sh
```

Keep the server name (`devdigest`) **before** the flags. `--env` is variadic —
it consumes every following bare argument — so putting the name after it
swallows the name as a second env value and fails with
`error: missing required argument 'commandOrUrl'`. The `--` ends `--env`'s
list and marks the start of the launch command.

Check it registered (and, with the API up, connected):

```sh
claude mcp list   # expect: devdigest: <path>/bin/start.sh - ✔ Connected
```

Registrations live in Claude Code's config directory, so they are only
visible to a `claude` started with the same `CLAUDE_CONFIG_DIR`. If you run
Claude Code through an alias that sets it (e.g. a separate profile), run
`mcp add` / `mcp list` / `mcp remove` through that same alias.

Use an **absolute path** to `bin/start.sh` here — unlike the root
`/.mcp.json`, this registration isn't anchored to the repo root, so a
relative path would break depending on where `claude` is launched from.
`bin/start.sh` itself still `cd`s into `mcp-server/` before running, so the
launch works regardless of the caller's cwd.

Turn it off again:

```sh
claude mcp remove devdigest --scope local
```

### 2. Debugging without Claude Code

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) talks to
the server directly, useful for poking at tools without an LLM in the loop:

```sh
cd mcp-server && npm run inspect   # or: pnpm inspect
# equivalent, from the repo root:
npx @modelcontextprotocol/inspector mcp-server/bin/start.sh
```

Same prerequisites as above (API running, `npm install` done). The Inspector
opens `http://localhost:6274` — click **Connect** (transport `STDIO`, command
pre-filled), then **Tools → List Tools**. Start with `list_agents`: it's free
and read-only. Every **Execute Tool** on `run_agent_on_pr` starts a new paid
run; to re-read a finished one, call `get_findings` with its `run_id`.
To pass a non-default API URL:
`npx @modelcontextprotocol/inspector -e DEVDIGEST_API_URL=http://localhost:3001 bin/start.sh`.

### Checking it's attached

Inside any Claude Code session started in this repo (root `/.mcp.json`
handles this automatically, once approved) — or one started via one of the
alternative routes above — run the `/mcp` slash command; it lists connected
MCP servers and their tools. `devdigest` should appear with its five tools
(`mcp__devdigest__list_agents`, `mcp__devdigest__run_agent_on_pr`,
`mcp__devdigest__get_findings`, `mcp__devdigest__get_conventions`,
`mcp__devdigest__get_blast_radius`). The first use of a newly attached
project-scoped server also prompts for one-time approval per checkout.

## Environment variables

Read once at startup by `src/config.ts` (`loadConfig()`); an invalid value
throws with the bad variable's *name*, never its value.

| Variable | Default | Constraint |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Must be an `http:`/`https:` URL with a loopback hostname (`localhost`, `127.0.0.1`, `::1`, `[::1]`) — enforced structurally, not just by convention (R12). |
| `DEVDIGEST_API_TOKEN` | *(unset)* | Optional. When set, sent as `Authorization: Bearer <token>` on every API call. The API doesn't check it today; this is forward-compatible. Never logged, and masked by `redact()` if it ever ends up in an error string. |
| `DEVDIGEST_RUN_WAIT_MS` | `120000` (120s) | 5,000–280,000. How long `run_agent_on_pr` polls before returning a non-error `status:"running"` instead of the finished result. The upper bound is deliberately below the root `/.mcp.json`'s `"timeout"` (300,000ms) — see Timeouts below. |
| `DEVDIGEST_RUN_POLL_MS` | `2000` (2s) | 250–30,000. Interval between `GET /pulls/:id/runs` polls while a run is in flight. |
| `DEVDIGEST_HTTP_TIMEOUT_MS` | `15000` (15s) | 1,000–60,000. Per-HTTP-call timeout (`AbortSignal.timeout`) to the DevDigest API, independent of the run-wait above. |

## Timeouts — three different knobs, don't confuse them

1. **`DEVDIGEST_RUN_WAIT_MS`** (this package, above) — how long `run_agent_on_pr` itself waits before handing back a "still running, call `get_findings`" reply. Bounded to ≤280,000ms by `src/config.ts`.
2. **The root `/.mcp.json`'s per-server `"timeout"` (300,000ms)** — Claude Code's own hard wall-clock limit on how long it will wait for *any* tool call to this server before killing it. It comfortably exceeds (1) so a timed-out wait always gets to reply. This field lives in `/.mcp.json`, **not** in this package's env — it's read and enforced by Claude Code itself, verified against the installed CLI (see `Insights.md`, 2026-09-26). Progress notifications (emitted during polling when the caller passes a `progressToken`) do **not** extend this — it is a genuinely hard wall-clock limit.
3. **`MCP_TOOL_TIMEOUT`** — a Claude Code environment variable (shell or `settings.json` `env`), the *global* fallback for any server that doesn't set its own `"timeout"`. It does **not** belong in `/.mcp.json`'s `env` block — that block is passed to the spawned server *process*, not read by Claude Code's own timeout logic. Document it here as the alternative for anyone who wants to change the timeout without editing `/.mcp.json`.

## Tool reference

All five tools are read-only except `run_agent_on_pr`, which starts a paid
LLM run and is annotated non-idempotent/open-world. Full per-tool spec
(exact error messages, output shapes, annotations) is in the plan
(`docs/plans/2026-09-26-mcp-server.md` §6b); condensed here:

| Tool | What it does | Calls the API? |
|---|---|---|
| `list_agents` | Lists configured reviewer agents (`id`, `name`, `description` ≤160 chars, `model`, `enabled`). No `system_prompt`. | `GET /agents` |
| `run_agent_on_pr(repo, pr, agent)` | Resolves agent/repo/PR, starts **one** review run, polls until done or `DEVDIGEST_RUN_WAIT_MS` elapses, returns the verdict + findings (or a non-error `status:"running"` with a `run_id` to hand to `get_findings`). Never retries the trigger POST. | `GET /agents`, `GET /repos`, `GET /repos/:id/pulls`, `POST /pulls/:id/review`, `GET /pulls/:id/runs` (polled), `GET /pulls/:id/reviews` |
| `get_findings(repo, pr, run_id?, agent?, min_severity?, max_findings?, response_format?)` | Gets finished review(s)' verdict/findings. With `run_id`: that one run's review. Without it: **every agent's latest review for the PR in one call** — `{ repo, pr, total_findings, counts, reviews: [...] }`, one entry per agent (each agent's most recent `kind:"review"` review), sorted most-severe agent first; `agent` narrows that list to one entry. The documented fallback after a `run_agent_on_pr` timeout. | `GET /repos`, `GET /repos/:id/pulls`, `GET /agents` (if `agent`), `GET /pulls/:id/runs` (if `run_id`), `GET /pulls/:id/reviews` |
| `get_conventions(repo, category?, max_rules?, response_format?)` | Returns the repo's **accepted** L02 conventions (house rules), never triggers a scan. | `GET /repos`, `GET /repos/:id/conventions` |
| `get_blast_radius(repo, pr)` | Resolves repo/pr, then reads `GET /pulls/:id/blast` once: the symbols declared in the PR's changed files, their callers as `file:line`, and the HTTP endpoints/crons that may be affected — served from `repo-intel`'s pre-built index (no reparse, no LLM). A degraded/incomplete index is not an error; the summary line names the reason and suggests a resync. | `GET /repos`, `GET /repos/:id/pulls`, `GET /pulls/:id/blast` |

Every response is a short summary line plus compact (non-pretty-printed)
JSON, capped at 24,000 characters. Finding and convention text originates
from PR/repo content and is marked **untrusted data** in every response
(server `instructions` and each tool's output) — a model reading it should
treat it as data to report on, never as instructions to follow.

## Sequence — `run_agent_on_pr`

```mermaid
sequenceDiagram
  participant CC as Claude Code (MCP client)
  participant M as mcp-server (stdio)
  participant API as server/ Fastify :3001
  participant EX as run-executor (background)
  participant DB as Postgres
  CC->>M: tools/call run_agent_on_pr {repo, pr, agent} (+progressToken)
  M->>API: GET /agents, GET /repos, GET /repos/:id/pulls (cached)
  API->>DB: workspace-scoped reads (getContext)
  M->>API: POST /pulls/:prId/review {agentId}
  API->>DB: insert agent_runs (status=running)
  API-->>M: {runs:[{run_id}]}
  API--)EX: fire-and-forget executeRuns
  EX->>DB: insert review + findings, then agent_runs status=done, then run_traces
  loop every DEVDIGEST_RUN_POLL_MS until terminal or DEVDIGEST_RUN_WAIT_MS
    M->>API: GET /pulls/:prId/runs
    API-->>M: RunSummary[] (status)
    M--)CC: notifications/progress (if progressToken)
  end
  alt status done
    M->>API: GET /pulls/:prId/reviews
    API-->>M: ReviewRecord[]
    M-->>CC: {status:"done", verdict, score, counts, findings[≤20]}
  else failed / cancelled
    M-->>CC: isError + next step
  else deadline reached
    M-->>CC: {status:"running", run_id} + "call get_findings with run_id"
  end
```

## Testing

```sh
cd mcp-server
npm install
npm run typecheck
npm run lint
npm test
```

All tests are hermetic: a fake `fetch` and a zero-delay `sleep` stand in for
the API, driven through a real MCP `Client` over an in-memory transport — no
running API, no Docker, no network.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A tool call returns "DevDigest API is not reachable at …" | The API isn't running, or is on a different port | `./scripts/dev.sh --no-client` (or the full `./scripts/dev.sh`); confirm the port matches `DEVDIGEST_API_URL` |
| "DevDigest database is not seeded" | Migrations/seed haven't run | `cd server && pnpm db:migrate && pnpm db:seed` |
| `devdigest` doesn't show up in `/mcp` | The root `/.mcp.json` project-scoped server hasn't been approved yet for this checkout, or you're not in the repo root | Approve the prompt Claude Code shows on first use, confirm you're running `claude` from the repo root, or check `claude mcp list` for a `--scope local` registration |
| `claude mcp add` fails with `missing required argument 'commandOrUrl'` | The server name came after the variadic `--env`, which swallowed it | Put `devdigest` right after `mcp add` (see "Persistent on this machine") |
| `mcp add` succeeded but `claude mcp list` doesn't show `devdigest` | Registered under a different `CLAUDE_CONFIG_DIR` (e.g. a profile alias) than the one you're listing with | Run `mcp add`/`mcp list` through the same `claude` alias/profile you start sessions with |
| `Run: cd mcp-server && npm install` on stderr, server exits | `mcp-server/node_modules` is missing | `cd mcp-server && npm install` |
| `Invalid DevDigest MCP server configuration — DEVDIGEST_API_URL: …` | `DEVDIGEST_API_URL` isn't a loopback `http`/`https` URL | Point it at `localhost`/`127.0.0.1`/`::1` — this server refuses non-loopback hosts by design (R12) |
| Claude Code kills a `run_agent_on_pr` call before it can reply | `/.mcp.json`'s `"timeout"` was lowered below `DEVDIGEST_RUN_WAIT_MS` | Keep `/.mcp.json`'s `"timeout"` comfortably above `DEVDIGEST_RUN_WAIT_MS` (default 300,000ms vs ≤280,000ms) |
| A server registered via `claude mcp add` (persistent route) doesn't pick up an `.env` change | `claude mcp add --env` values are captured at registration time | `claude mcp remove devdigest --scope local` then re-add with the new value, or rely on the root `/.mcp.json`, which re-reads `DEVDIGEST_API_URL` from the shell env each session |

## Package layout

See `AGENTS.md` for the file-by-file map, layering rules, and gotchas; see
`Insights.md` for dated findings (env/CLI verification, a Zod path-alias
pitfall). Full design rationale, resolved facts, and the per-tool contract
tables live in `docs/plans/2026-09-26-mcp-server.md`.
