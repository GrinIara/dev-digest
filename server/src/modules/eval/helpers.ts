import type { EvalCase, EvalCaseRun, EvalOwnerKind } from '@devdigest/shared';
import type { EvalCaseRow, EvalRunRow } from './repository.js';

/**
 * Pure DTO mapping for the eval module — DB row ⇄ public shape. No I/O.
 */

/** Map a persisted eval_cases row to the public `EvalCase` DTO. */
export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    name: row.name,
    // `EvalCase.input_diff` is a required string in the shared contract; the
    // DB column is nullable (a case created directly in the DB could be
    // null), so fall back to '' rather than leak `null` past the contract.
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
  };
}

/** Map a persisted eval_runs row to the public `EvalCaseRun` DTO (1:1 with the table). */
export function toEvalCaseRunDto(row: EvalRunRow): EvalCaseRun {
  return {
    id: row.id,
    case_id: row.caseId,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}
