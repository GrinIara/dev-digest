# client — Spec: routes and their data

The contract for what each route loads and renders. If you add or change a route, keep this table true.

| Route | File | Component kind | Data hooks (`src/lib/hooks/*`) | Renders |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | Client | `useRepos()` | nothing itself — redirects to the first repo's PR list, or to `/onboarding` if there are none |
| `/onboarding` | `src/app/onboarding/page.tsx` → `AddRepoView` | Client | `useAddRepo()`, `useSecretsStatus()`, `useTestConnection()` | form to register a new repo (owner/name + PAT) |
| `/agents` | `src/app/agents/page.tsx` → `AgentsListView` | Server shell → Client child | `useAgents()`, `useUpdateAgent()` | list of review agents (name, model, provider, enabled toggle) |
| `/agents/[id]` | `src/app/agents/[id]/page.tsx` | Client | `useAgents()`, `useAgent(id)`, `useUpdateAgent()` | agent list sidebar + one agent's editable config (model, provider, system prompt) |
| `/repos/[repoId]/pulls` | `src/app/repos/[repoId]/pulls/page.tsx` | Client | `usePulls(repoId)`, `useRefreshRepo()` | filterable/sortable PR table — score, findings, status, cost, updated |
| `/repos/[repoId]/pulls/[number]` | `src/app/repos/[repoId]/pulls/[number]/page.tsx` | Client | `usePulls(repoId)` (number→uuid), `usePullDetail(prId)`, `usePrReviews(prId)`, `usePrActiveRuns(prId)`, `usePrRuns(prId)`, `useDeleteRun`, `useCancelRun` | PR detail across tabs: Overview (body), Agent runs / findings (Timeline + Review-runs), Files changed (diff) |
| `/settings/[section]` | `src/app/settings/[section]/page.tsx` → `SettingsView` | Server shell → Client child | `useSettings()`, `useUpdateSettings()`, `useTestConnection()`, `useSecretsStatus()` | API-keys form or feature-model selection, keyed by `:section` |

No `route.ts` Route Handlers exist under `src/app` — the only backend is `server/`'s Fastify API.

## Route-folder naming

Dynamic segments are camelCase inside the brackets (`[repoId]`, `[number]`, `[id]`, `[section]`); no kebab-case dynamic segment names exist anywhere in `src/app`.
