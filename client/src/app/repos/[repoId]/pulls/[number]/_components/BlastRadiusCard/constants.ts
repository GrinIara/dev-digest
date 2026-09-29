/** Hard cap on how long the Resync button polls for a completed reindex
 * before giving up (T8). JobRunner's own hard budget is 120s
 * (`repo-intel/constants.ts`'s `INDEX_SOFT_BUDGET_MS` finishes a full index as
 * `partial` before that), so 130s gives one full run a little headroom. */
export const RESYNC_POLL_MAX_MS = 130_000;
