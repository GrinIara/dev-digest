import type { DevDigestApi } from '../domain/ports.js';
import type { Resolver } from '../domain/resolve.js';
import type { McpConfig } from '../config.js';

/**
 * Dependencies every tool handler needs, injected once at the composition
 * root (`src/index.ts`) or by a test's `connect()` helper. `resolver` is
 * shared (not re-created per call) so its `(repo, number) → prId` cache lives
 * for the process lifetime (§0.1).
 *
 * Lives in `src/tools/` rather than `src/server.ts` so `src/tools/*.ts` never
 * has to import the composition root just to get this type — `server.ts`
 * imports it from here instead, keeping the dependency direction one-way
 * (arch review F2). `server.ts` re-exports the type for existing external
 * consumers (tests, `index.ts`), but `src/tools/*.ts` must always import it
 * from this file, never from `../server.js`.
 */
export interface ServerDeps {
  api: DevDigestApi;
  config: McpConfig;
  resolver: Resolver;
  /** Injected for hermetic, zero-delay tests (`run_agent_on_pr`'s wait). */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}
