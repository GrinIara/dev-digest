import type { Container } from '../../platform/container.js';
import type {
  EvalCase,
  EvalCaseRun,
  EvalOwnerKind,
  Provider,
  Review,
  ReviewStrategy,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { EvalRepository, type EvalCaseFilters, type EvalCaseRow } from './repository.js';
import { toEvalCaseDto, toEvalCaseRunDto } from './helpers.js';
import { SKILL_EVAL_MODEL, SKILL_EVAL_PROVIDER, SKILL_EVAL_SYSTEM_PROMPT } from './constants.js';

/**
 * Eval module — owner-agnostic business logic over eval_cases/eval_runs
 * (owner_kind 'skill' | 'agent'). Serves both a future Skill "Evals" tab and
 * a future Agent "Evals" tab from one implementation.
 *
 * The "Run on evals" action dispatches to one of two review paths depending
 * on the case's owner_kind, both built on reviewer-core's `reviewPullRequest`
 * (the same pure engine `modules/reviews/run-executor.ts` uses):
 *  - skill owner: no agent/provider/model configured for a bare skill, so we
 *    use a fixed cheap default provider/model + a minimal generic system
 *    prompt, and send ONLY that one skill.
 *  - agent owner: reuse the agent's real provider/model/systemPrompt/strategy
 *    and its linked+enabled skills, exactly like a production review run.
 *
 * This is an EVAL run, not a production review run — no `agent_runs`/
 * `run_traces` rows, no SSE streaming; only one `eval_runs` row is persisted.
 */

export interface CreateEvalCaseInput {
  owner_kind: EvalOwnerKind;
  owner_id: string;
  name: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string;
}

export interface UpdateEvalCaseInput {
  name?: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string;
}

export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  async list(workspaceId: string, filters: EvalCaseFilters = {}): Promise<EvalCase[]> {
    const rows = await this.repo.list(workspaceId, filters);
    return rows.map(toEvalCaseDto);
  }

  async get(workspaceId: string, id: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toEvalCaseDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateEvalCaseInput): Promise<EvalCase> {
    const row = await this.repo.insert({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff ?? null,
      inputFiles: input.input_files,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });
    return toEvalCaseDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateEvalCaseInput,
  ): Promise<EvalCase | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  /** Delete a case (and its run history, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Run history for a case, newest first. Workspace-scoped: returns
   * undefined when the case isn't in this workspace (route → 404).
   */
  async listRuns(workspaceId: string, caseId: string): Promise<EvalCaseRun[] | undefined> {
    const kase = await this.repo.getById(workspaceId, caseId);
    if (!kase) return undefined;
    const rows = await this.repo.listRuns(caseId);
    return rows.map(toEvalCaseRunDto);
  }

  /**
   * The "Run on evals" action for one case: dispatch to the skill- or
   * agent-owner review path, persist exactly one `eval_runs` row, and return
   * it. A run that throws (missing owner row, LLM failure, …) is still
   * persisted — as a failed run (`pass: false`, the error message in
   * `actual_output`) — rather than losing the attempt.
   */
  async run(workspaceId: string, caseId: string): Promise<EvalCaseRun | undefined> {
    const kase = await this.repo.getById(workspaceId, caseId);
    if (!kase) return undefined;

    const start = Date.now();
    try {
      const outcome =
        kase.ownerKind === 'skill'
          ? await this.runSkillOwner(workspaceId, kase)
          : await this.runAgentOwner(workspaceId, kase);
      const row = await this.repo.insertRun({
        caseId: kase.id,
        actualOutput: outcome.review,
        pass: scorePass(kase.expectedOutput, outcome.review),
        durationMs: Date.now() - start,
        costUsd: outcome.costUsd,
        // recall / precision / citation_accuracy are intentionally left null:
        // `expected_output` has no fixed schema for a per-finding (expected
        // vs. actual, matched by e.g. file+line+category) comparison yet, so
        // there's no cheap AND honest way to compute them here — fabricating
        // a scoring algorithm the spec didn't ask for isn't the goal.
      });
      return toEvalCaseRunDto(row);
    } catch (err) {
      const row = await this.repo.insertRun({
        caseId: kase.id,
        actualOutput: { error: (err as Error).message },
        pass: false,
        durationMs: Date.now() - start,
        costUsd: null,
      });
      return toEvalCaseRunDto(row);
    }
  }

  /** Skill-owner run: one skill, fixed cheap default provider/model. */
  private async runSkillOwner(workspaceId: string, kase: EvalCaseRow) {
    const skill = await this.repo.getSkillById(workspaceId, kase.ownerId);
    if (!skill) throw new Error('Skill not found for eval case owner');
    const llm = await this.container.llm(SKILL_EVAL_PROVIDER);
    const diff = parseUnifiedDiff(kase.inputDiff ?? '');
    return reviewPullRequest({
      systemPrompt: SKILL_EVAL_SYSTEM_PROMPT,
      model: SKILL_EVAL_MODEL,
      diff,
      llm,
      strategy: 'single-pass',
      skills: [{ id: skill.id, body: skill.body }],
      task: `Eval case "${kase.name}"`,
    });
  }

  /** Agent-owner run: the agent's real provider/model/prompt/strategy + its linked+enabled skills. */
  private async runAgentOwner(workspaceId: string, kase: EvalCaseRow) {
    const agent = await this.container.agentsRepo.getById(workspaceId, kase.ownerId);
    if (!agent) throw new Error('Agent not found for eval case owner');
    const linkedSkills = await this.container.agentsRepo.linkedSkills(agent.id);
    const skills = linkedSkills
      .filter((l) => l.skill.enabled)
      .map((l) => ({ id: l.skill.id, body: l.skill.body }));
    const llm = await this.container.llm(agent.provider as Provider);
    const diff = parseUnifiedDiff(kase.inputDiff ?? '');
    return reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: (agent.strategy as ReviewStrategy) ?? 'single-pass',
      ...(skills.length > 0 ? { skills } : {}),
      task: `Eval case "${kase.name}"`,
    });
  }
}

/**
 * Pass/fail rule for an eval run. When the case doesn't specify
 * `expected_output`, a run that completed without throwing is a pass — there
 * is nothing to compare against. When `expected_output` is an object with a
 * numeric `min_findings`, pass requires the grounded review to have kept at
 * least that many findings — the only comparison cheap and honest enough to
 * make without a fixed `expected_output` schema. Any other shape is ignored
 * (treated as "nothing to compare"), rather than guessing at a schema.
 */
function scorePass(expectedOutput: unknown, review: Review): boolean {
  if (expectedOutput && typeof expectedOutput === 'object' && 'min_findings' in expectedOutput) {
    const min = (expectedOutput as { min_findings?: unknown }).min_findings;
    if (typeof min === 'number') return review.findings.length >= min;
  }
  return true;
}
