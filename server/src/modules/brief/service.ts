import {
  generateBrief as runBrief,
  type BriefGeneratorOutcome,
  type BriefIssue,
} from '@devdigest/reviewer-core';
import {
  PrBrief,
  type BriefMissingInput,
  type Intent,
  type PrBriefResponse,
  type RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
} from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { BlastService } from '../blast/service.js';
import { ProjectContextService } from '../project-context/service.js';
import { diffFromPrFiles } from '../reviews/diff-loader.js';
import { fetchLinkedIssue } from '../reviews/intent-classifier.js';
import { parseContextLinks, redactDetail } from '../reviews/intent-links.js';
import { ReviewRepository, type PullRow } from '../reviews/repository.js';
import type { Logger } from '../reviews/run-executor.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BRIEF_TIMEOUT_MS } from './constants.js';
import {
  blastToFacts,
  buildAllowList,
  groundBriefOutput,
  issueLinksToPlan,
  issuesToMissing,
  specsToMissing,
  toFileFacts,
} from './helpers.js';
import { BriefRepository } from './repository.js';

interface Gathered {
  outcome: BriefGeneratorOutcome;
  intent: Intent | null;
  blastSnapshot: PrBrief['blast'];
  missing: BriefMissingInput[];
  allow: ReturnType<typeof buildAllowList>;
  issuesFetched: number;
}

/**
 * Brief application layer. No Fastify/Drizzle imports. `getBrief` never
 * touches GitHub or the LLM; `generateBrief` makes one structured model call
 * plus bounded issue fetches, all inside one 60 s budget, and persists only
 * after that budget resolved successfully.
 */
export class BriefService {
  private inFlight = new Set<string>();
  private reviewRepo: ReviewRepository;
  private briefRepo: BriefRepository;
  private blast: BlastService;
  private projectContext: ProjectContextService;

  constructor(private container: Container) {
    this.reviewRepo = new ReviewRepository(container.db);
    this.briefRepo = new BriefRepository(container.db);
    this.blast = new BlastService(container);
    this.projectContext = new ProjectContextService(container);
  }

  async getBrief(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const parsed = PrBrief.safeParse(await this.briefRepo.getBriefJson(prId));
    if (!parsed.success) return { brief: null, stale: false };
    return { brief: parsed.data, stale: parsed.data.head_sha !== pull.headSha };
  }

  async generateBrief(workspaceId: string, prId: string, log: Logger): Promise<PrBriefResponse> {
    const pull = await this.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');
    const files = await this.reviewRepo.getPrFiles(prId);
    if (files.length === 0) {
      throw new ConflictError('no_changed_files', 'No changed files are stored for this pull request');
    }
    if (this.inFlight.has(prId)) {
      throw new ConflictError('brief_in_progress', 'A brief is already being generated');
    }
    this.inFlight.add(prId);
    const started = Date.now();
    let provider: string | null = null;
    let model: string | null = null;
    try {
      const choice = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
      provider = choice.provider;
      model = choice.model;
      const llm = await this.container.llm(choice.provider);

      let g: Gathered;
      try {
        g = await withTimeout(
          this.gatherAndGenerate({ workspaceId, pull, repoRow, files, model: choice.model, llm, started, log }),
          BRIEF_TIMEOUT_MS,
        );
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new ExternalServiceError('Brief generation failed: ' + redactDetail(err));
      }

      const { outcome } = g;
      const grounded = groundBriefOutput(outcome.output, g.allow);
      const brief: PrBrief = {
        summary: outcome.output.summary,
        intent: g.intent,
        blast: g.blastSnapshot,
        risks: { risks: grounded.risks },
        review_focus: grounded.review_focus,
        history: { history: [] },
        missing_inputs: g.missing,
        inputs: { specs: outcome.specs, issues: outcome.issues },
        dropped: grounded.dropped,
        head_sha: pull.headSha,
        generated_at: new Date().toISOString(),
        model: outcome.model,
        provider: choice.provider,
        tokens_in: outcome.tokensIn,
        tokens_out: outcome.tokensOut,
        cost_usd: outcome.costUsd,
      };
      await this.briefRepo.upsertBrief(prId, brief);

      log.info(
        {
          prId,
          provider: brief.provider,
          model: brief.model,
          attempts: outcome.attempts,
          tokensIn: brief.tokens_in,
          tokensOut: brief.tokens_out,
          costUsd: brief.cost_usd,
          risks: brief.risks.risks.length,
          focus: brief.review_focus.length,
          dropped: brief.dropped,
          missingCount: brief.missing_inputs.length,
          missing: brief.missing_inputs.map((m) => `${m.input}:${m.reason}`),
          issuesFetched: g.issuesFetched,
          issuesMissing: brief.missing_inputs.filter((m) => m.input === 'issue').length,
          durationMs: Date.now() - started,
        },
        'brief: generated',
      );
      return { brief, stale: false };
    } catch (err) {
      // Never log prompt/description/document text (NFR-4): only the error class and code.
      log.warn(
        {
          prId,
          provider,
          model,
          error: err instanceof Error ? err.name : 'unknown',
          code: err instanceof AppError ? err.code : null,
          durationMs: Date.now() - started,
        },
        'brief: generation failed',
      );
      throw err;
    } finally {
      this.inFlight.delete(prId);
    }
  }

  /** Gather every fact and run the one model call. Performs NO writes. */
  private async gatherAndGenerate(args: {
    workspaceId: string;
    pull: PullRow;
    repoRow: { id: string; owner: string; name: string; clonePath: string | null };
    files: { path: string; additions: number; deletions: number }[];
    model: string;
    llm: Awaited<ReturnType<Container['llm']>>;
    started: number;
    log: Logger;
  }): Promise<Gathered> {
    const { workspaceId, pull, repoRow, files, log } = args;
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };

    const storedIntent = await this.reviewRepo.getIntent(pull.id);
    const intent: Intent | null = storedIntent
      ? {
          summary: storedIntent.summary,
          in_scope: storedIntent.in_scope,
          out_of_scope: storedIntent.out_of_scope,
          risk_areas: storedIntent.risk_areas,
          confidence: storedIntent.confidence,
          sources: storedIntent.sources,
        }
      : null;
    const missing: BriefMissingInput[] = intent
      ? []
      : [{ input: 'intent', status: 'missing', reason: 'not_classified', ref: null }];

    const blastResp = await this.blast.getBlast(workspaceId, pull.id, log);
    const blast = blastToFacts(blastResp);
    missing.push(...blast.missing);

    const specsResult = await this.projectContext.resolveForRepo(workspaceId, repoRow);
    missing.push(...specsToMissing(specsResult));

    const diff = await diffFromPrFiles(this.reviewRepo, pull.id);
    const fileFacts = toFileFacts(diff, files);

    const plan = issueLinksToPlan(parseContextLinks(pull.body, ref, pull.number));
    const fetched = await Promise.all(
      plan.toFetch.map((l) => fetchLinkedIssue(this.container, ref, l)),
    );
    const issues: BriefIssue[] = [];
    fetched.forEach((f, i) => {
      if (f.status === 'used' || f.status === 'truncated') {
        issues.push({ ref: `#${plan.toFetch[i]!.number}`, title: f.title ?? '', body: f.body ?? '' });
      }
    });
    const issueMissing = issuesToMissing(plan.toFetch, fetched, plan.unsupported);
    missing.push(...issueMissing);

    const outcome = await runBrief({
      model: args.model,
      llm: args.llm,
      title: pull.title,
      description: pull.body,
      issues,
      intent,
      blast: blast.facts,
      files: fileFacts,
      specs: specsResult.status === 'resolved' ? specsResult.docs : [],
      missing,
      timeoutMs: Math.max(1, BRIEF_TIMEOUT_MS - (Date.now() - args.started)),
      sessionId: `${ref.owner}/${ref.name}#${pull.number}:brief`,
    });

    const callers = (blast.snapshot?.downstream ?? []).flatMap((d) =>
      d.callers.map((c) => ({ file: c.file, line: c.line })),
    );
    return {
      outcome,
      intent,
      blastSnapshot: blast.snapshot,
      missing,
      allow: buildAllowList(fileFacts, callers),
      issuesFetched: issues.length,
    };
  }
}
