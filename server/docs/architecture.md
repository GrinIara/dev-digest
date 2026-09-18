# server — Architecture: DI container & adapters

## The container

`src/platform/container.ts` defines `Container` (class starts around line 53), constructed once per app instance in `src/app.ts`'s `buildApp(config, db, overrides)` from `config`, `db`, and an optional `ContainerOverrides` object (`container.ts:39-51`) used by tests to inject mocks.

Fastify decorates the app with `app.container`; route handlers never touch `ContainerOverrides` directly — they call `container.<port>` (a getter) or `container.<port>()` (an async method) and resolve request-scoped tenancy via `getContext(container, req)` (`src/modules/_shared/context.ts:14-24`), which resolves `{ workspaceId, userId }` from `container.auth.currentUser/currentWorkspace(req)`. Almost every route handler across `modules/*/routes.ts` opens with:

```ts
const { workspaceId } = await getContext(container, req);
```

## Port shapes: getter vs. async method

Not every port is exposed the same way, and the difference is meaningful:

- **Eager, built in the constructor**: `secrets` (`SecretsProvider`), `auth` (`AuthProvider`) — always needed, cheap to build.
- **Lazy getters**: `git`, `codeIndex`, `repoIntel`, `depgraph`, `tokenizer`, `priceBook` — constructed on first access, no I/O to build them.
- **Async methods**: `github()`, `llm(providerId)`, `embedder()` — these must look up a secret (API key / PAT) via `SecretsProvider` before they can construct anything, so they're `Promise`-returning and cached (`llm`'s cache is keyed by provider id). `embedder()` additionally throws before any OpenAI call if `config.embeddingsEnabled` is false — a disabled feature fails fast rather than silently calling out.

## The port + prod/mock pattern

The interface for each port lives in `src/vendor/shared/adapters.ts` (the shared contracts package) — e.g. `LLMProvider` (`listModels`, `complete`, `completeStructured`, `embed`), `GitHubClient`, `GitClient`. The **production implementation** lives under `src/adapters/<name>/` (`adapters/llm/openai.ts`'s `OpenAIProvider`, `adapters/llm/anthropic.ts`'s `AnthropicProvider`, `adapters/github/octokit.ts`'s `OctokitGitHubClient`, `adapters/git/simple-git.ts`'s `SimpleGitClient`). The **mock implementation**, however, is centralized in one file, `src/adapters/mocks.ts` (`MockLLMProvider`, `MockEmbedder`, `MockGitHubClient`, `MockGitClient`, `MockCodeIndex`, `MockAuthProvider`, `MockSecretsProvider`) — mocks are not colocated per-adapter-folder, despite what a first read of `adapters.ts`'s header comment might suggest.

Tests inject these via `overrides` when calling `buildApp`:

```ts
buildApp({
  config: config(), db: pg.handle.db,
  overrides: {
    embedder: new MockEmbedder(),
    git: new MockGitClient({ diff: DIFF }),
    llm: { [provider]: new MockLLMProvider(provider, { structured }) },
  },
});
```

`MockLLMProvider.completeStructured` validates the caller-supplied fixture against the *real* Zod schema before returning it, so tests exercise real schema validation end-to-end, not just a stub.

## The one deliberate exception: `astgrep`

`src/adapters/astgrep/index.ts` is **not** container-mediated. It exports plain functions (`parseSymbols`, `parseReferences`, `parseImports`, `parseInvocationHeads`, `parseChangedFiles`) imported directly by `modules/repo-intel/pipeline/{incremental,full}.ts` and `modules/repo-intel/service.ts`. There is no `ContainerOverrides.astgrep`, no port interface, no mock. If you're adding a new adapter, default to the port+prod+mock pattern above — `astgrep` is the intentional odd one out (stateless, no external I/O to mock), not a second convention to follow.
