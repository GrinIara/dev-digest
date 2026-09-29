/**
 * blast module constants. `BLAST_SOURCE` is used only as the log-field value
 * naming where a response's data came from (R3's "one info line" guarantee).
 */
export const BLAST_SOURCE = { index: 'index', skipped: 'skipped' } as const;
export type BlastSource = (typeof BLAST_SOURCE)[keyof typeof BLAST_SOURCE];
