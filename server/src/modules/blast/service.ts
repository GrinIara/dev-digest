import type { Container } from '../../platform/container.js';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { Logger } from '../reviews/run-executor.js';
import type { BlastResult, IndexState } from '../repo-intel/types.js';
import { BlastRepository } from './repository.js';
import { indexableFiles, resolveDegraded, toBlastRadiusResponse } from './helpers.js';
import { BLAST_SOURCE } from './constants.js';

/**
 * Blast application/use-case layer. No Fastify or Drizzle imports —
 * orchestration only, mirroring `smart-diff/service.ts`.
 *
 * The one property this module exists to guarantee (R3): a request makes at
 * most ONE `container.repoIntel.getBlastRadius` call, and ZERO calls when the
 * index isn't usable — this module never reaches the LLM, embedder, GitHub or
 * code-index adapters, and never triggers a clone read.
 */
export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  async getBlast(workspaceId: string, prId: string, log?: Logger): Promise<BlastRadiusResponse> {
    const startedAt = Date.now();

    const pull = await this.repo.getPullForWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.repo.getPrFilePaths(prId);
    const flagOn = this.container.config.repoIntelEnabled;
    const state: IndexState | null = flagOn
      ? await this.container.repoIntel.getIndexState(pull.repoId)
      : null;
    const usable =
      flagOn && files.length > 0 && !!state && (state.status === 'full' || state.status === 'partial');

    // The ONE facade read call — never invoked when `usable` is false, so the
    // facade's own ripgrep/clone fallback (which would re-analyze the repo)
    // is never reached from this module (A5).
    const result: BlastResult | null = usable
      ? await this.container.repoIntel.getBlastRadius(pull.repoId, files)
      : null;

    // Same "usable" gate as the facade read above (A5): a pure DB read, never
    // triggered when the index isn't ready. Lets the response distinguish
    // "no downstream impact" from "these changed files aren't in the index
    // yet" (new files, or an index older than the PR — see the PR #218 bug
    // this fixes).
    // Only source files the indexer parses count toward coverage.
    const sourceFiles = indexableFiles(files);
    const indexedCount = usable && sourceFiles.length > 0
      ? await this.container.repoIntel.countIndexedFiles(pull.repoId, sourceFiles)
      : 0;

    const degradedInfo = resolveDegraded({ flagOn, state, filesCount: files.length, result });
    const response = toBlastRadiusResponse(
      prId,
      result,
      degradedInfo,
      state,
      { changed: sourceFiles.length, indexed: indexedCount },
      pull.defaultBranch ?? null,
    );

    log?.info(
      {
        prId,
        repoId: pull.repoId,
        source: usable ? BLAST_SOURCE.index : BLAST_SOURCE.skipped,
        indexStatus: state?.status ?? null,
        files: files.length,
        filesIndexed: response.files.indexed,
        symbols: response.counts.symbols,
        callers: response.counts.callers,
        endpoints: response.counts.endpoints,
        crons: response.counts.crons,
        degraded: response.degraded,
        reason: response.reason,
        durationMs: Date.now() - startedAt,
      },
      usable
        ? 'blast: read from repo-intel index (no reparse)'
        : 'blast: index not usable, served degraded (no reparse)',
    );

    return response;
  }
}
