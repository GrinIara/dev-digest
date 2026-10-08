/** Overall bound on brief generation: fact gathering (incl. issue fetches) + the model call. */
export const BRIEF_TIMEOUT_MS = 60_000;
export const BRIEF_MAX_RISKS = 8;
export const BRIEF_MAX_FOCUS = 8;
export const BRIEF_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
/** Cap for a ref rendered into the trusted "Input status" prompt section. */
export const BRIEF_MAX_REF_CHARS = 120;
