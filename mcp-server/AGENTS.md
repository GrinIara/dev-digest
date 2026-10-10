# mcp-server — agent map

## Session protocol
Your first action in this module — before opening any of its code, even for a read-only question or a quick explanation — is to read `Insights.md` in full. When a session surfaces a substantial, non-obvious finding, use the `engineering-insights` skill to append it (skip if nothing new).

## Stack
TypeScript 5.7 · Zod 3 · `@modelcontextprotocol/sdk` (stdio transport). A thin
delivery adapter over the running `server/` HTTP API — no DB, GitHub, LLM or
filesystem access, and no direct import of `server/` runtime code. Never
emits JS: run as TypeScript source via `tsx`, consistent with
`reviewer-core/`.

## Commands
- `npm run typecheck`
- `npm test` — vitest, fully hermetic (fake `fetch`, zero-delay `sleep`, no real API/network)
- `npm run lint`
- `npm run start` (or `bin/start.sh`) — runs the stdio server; not started by `./scripts/dev.sh` (opt-in, see `README.md`)
- `npm run inspect` — opens MCP Inspector against `bin/start.sh` (needs the API running)

## Map
- `src/config.ts` — `loadConfig()`, loopback-only `DEVDIGEST_API_URL` enforcement, clamped wait/poll/HTTP timeouts
- `src/log.ts` — stderr-only structured logging + `redact()`
- `src/api/client.ts` — the only file that calls `fetch`; implements `DevDigestApi` (`src/domain/ports.ts`)
- `src/api/schemas.ts` — local Zod response schemas (unknown keys stripped), type-checked against `@devdigest/shared`
- `src/api/errors.ts` — maps transport/HTTP failures to `ApiError`
- `src/domain/ports.ts` — the `DevDigestApi` port + response types, owned by the domain
- `src/domain/resolve.ts` — `Resolver` (agent/repo/PR resolution, PR-id cache)
- `src/domain/wait.ts` — `waitForRun()`, the bounded poll loop
- `src/domain/format.ts` — response shaping, truncation, severity sort
- `src/domain/tool-result.ts` — `ok()`/`fail()`, `ToolError`, `apiErrorToMessage()`
- `src/tools/deps.ts` — the `ServerDeps` interface every tool handler is injected with (moved out of `src/server.ts` so `tools/*.ts` never imports the composition root)
- `src/tools/*.ts` — the five MCP tools (delivery layer: arg schemas, result shaping only)
- `src/server.ts` — `createServer(deps)`, server `instructions`, tool registration; re-exports `ServerDeps` from `src/tools/deps.ts` for existing consumers
- `src/index.ts` — stdio composition root
- `bin/start.sh` — cwd-independent launcher, used by the root `/.mcp.json` and `claude mcp add`

## Conventions (non-default)
- Layering is `tools/*` → `domain/*` → `domain/ports.ts` ← `api/client.ts`. `domain/*` never imports the MCP SDK or `fetch` (global); `tools/*` never imports `src/api/*`, `../server.js` (the composition root — inject `ServerDeps` from `./deps.js` instead) or `fetch` (global); only `src/index.ts` wires `createHttpApi` into `createServer`. Lint-enforced (`no-restricted-imports` + `no-restricted-globals` in `eslint.config.mjs`, one rule set per folder).
- `@devdigest/shared` is imported **type-only**. Runtime parsing of API responses uses this package's own local Zod schemas (`src/api/schemas.ts`), never the shared runtime schemas — see `Insights.md` for why (`zod/*` path-alias collision).
- stdout carries JSON-RPC exclusively. All logging goes through `src/log.ts` to stderr; `no-console` is an ESLint error.
- Tool names and input schemas (`src/tools/shared-inputs.ts`, `src/tools/*.ts`) are a public MCP contract — the model-facing strings are copied verbatim from the plan and asserted `toBe` (not `toContain`) in `test/tools-list.test.ts`.
- `run_agent_on_pr` never retries `POST /pulls/:id/review`. Every error path after a successful trigger steers the model to `get_findings` instead — including a `'timeout'`/`'invalid_response'` `ApiError` on the trigger call itself, which may mean the server already started the run even though this process never saw a valid ack (`'unreachable'`/`http` errors on that same call are not routed this way, since nothing was created server-side).
- Findings/conventions text is untrusted repo content: it stays inside JSON-string fields with a fixed marker sentence, never concatenated into instructions.
- `createHttpApi` (`src/api/client.ts`) is side-effect free: it never calls `registerSecret`. The composition root (`src/index.ts`) calls `registerSecret(config.apiToken)` itself, right after `loadConfig()`; tests that check token redaction must call it explicitly too.
- Every outbound request sends `redirect: 'error'` — a redirect could otherwise carry the request (and any `Authorization` header) off loopback.

## Naming conventions
- One file per pipeline concern (`resolve.ts`, `wait.ts`, `format.ts`, `tool-result.ts`), same convention as `reviewer-core/`.
- Tests are all plain `*.test.ts` in `test/` — this package is fully hermetic (fake `fetch`, no DB/network), so there's no `*.it.test.ts` split like `server/` has.
- Zod schema naming matches the repo convention: `export const X = z.object(...); export type X = z.infer<typeof X>`.

## Gotchas
- The API must be running (`./scripts/dev.sh`) for every tool — none of the five is a no-op stub. Every network-error message names `./scripts/dev.sh`.
- `GET /repos/:id/pulls` syncs from GitHub first when a token is configured, so it is slow — `Resolver` caches `(repo, number) → pr_id` for the process lifetime.
- A run can reach a terminal status without a `run_traces` row (boot reaper, orphan cancel — `server/src/modules/reviews/service.ts:90-100`), so completion is detected by polling `GET /pulls/:id/runs` (`RunSummary.status`), never `/runs/:id/trace`.
- The root `/.mcp.json`'s per-server `"timeout"` (ms, hard wall-clock, overrides `MCP_TOOL_TIMEOUT` for this server) is a different knob from `MCP_TOOL_TIMEOUT`/`MCP_TIMEOUT` (Claude Code's own env, not this package's `env` block, and not read from `/.mcp.json`'s `env`). Progress notifications never extend either timeout. See `mcp-server/README.md` for the layering and `Insights.md` for what was verified against the installed CLI.
- The global API rate limit (10/min on the review-trigger route, 120/min overall) is shared with the web UI's own polling — `wait.ts` backs off ×2 (capped at 10s) on a transient 429/5xx during polling rather than failing.

## Do not touch
- `package-lock.json` — regenerate via `npm install`, never hand-edit.
- Tool names and input schemas (`src/tools/*.ts`, `src/tools/shared-inputs.ts`) — a public contract for any MCP client; changing them without updating `test/tools-list.test.ts`'s verbatim assertions breaks the documented interface silently.
- `server/`, `client/`, `server/src/vendor/shared` — this package consumes the API over HTTP and reads `@devdigest/shared` type-only; it never edits those packages (see plan `docs/plans/2026-09-26-mcp-server.md` §0.7 for why an HTTP client, not an in-process import).

## Read When
- Setup, opt-in registration routes, env vars, tool reference → [README.md](README.md)
- Decisions & gotchas log → `Insights.md`
- Full design rationale (resolved facts, per-tool spec tables, verbatim model-facing strings) → `docs/plans/2026-09-26-mcp-server.md`
