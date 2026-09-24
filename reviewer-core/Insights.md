# reviewer-core — Insights

Append-only log of gotchas and non-obvious decisions discovered *after* the
fact — not upfront design. If an entry becomes load-bearing enough that every
session needs it, promote it into `AGENTS.md` instead. Don't duplicate an
existing entry, even reworded — extend it instead. Past ~150 entries, move
older/superseded ones into `Insights-archive.md`.

Format:

## YYYY-MM-DD — [Category] short title
What happened, what was decided, why. (Category: Pattern, Mistake, Decision, or Context.)

## 2026-09-24 — [Mistake] `StructuredRequest.timeoutMs` was defined but never actually read by `OpenRouterProvider.completeStructured` — a per-call timeout needs the `openai` SDK's second `create()` argument, not just the constructor option
`OpenRouterProviderOptions.timeoutMs` (`llm/openrouter.ts:33`) only sets the OpenAI SDK client's constructor-level default (`opts.timeoutMs ?? 90_000`, read once at `new OpenAI({ timeout: ... })`). `completeStructured` was calling `this.client.chat.completions.create({...body})` with a single argument, so every caller's per-request `req.timeoutMs` (`StructuredRequest.timeoutMs`, `vendor/shared/adapters.ts`) was silently ignored — `intent.ts`'s `classifyIntent` (`timeoutMs: input.timeoutMs ?? 30000`) had no actual effect on the real provider. The `openai` SDK's `create(body, options?: RequestOptions)` second argument is a genuinely different mechanism: its `timeout` field drives the SDK's own `fetchWithTimeout` (`node_modules/openai/core.js`), which creates a real `AbortController` and calls `.abort()` on expiry — actual HTTP cancellation, unlike this repo's own `withTimeout` helper (`server/src/platform/resilience.ts`), which is a plain `Promise.race` that never cancels the raced-away promise's underlying work. When a caller needs a genuinely-cancelling per-call timeout on an `openai`-SDK-backed provider, pass it through the SDK's second `RequestOptions` argument, not just a constructor option — and don't assume `Promise.race`-style helpers like `withTimeout` bound anything beyond how long the *caller* waits.
