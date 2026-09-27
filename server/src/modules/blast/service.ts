import type { Container } from '../../platform/container.js';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { Logger } from '../reviews/run-executor.js';
import type { BlastResult, IndexState } from '../repo-intel/types.js';
import { BlastRepository } from './repository.js';
import { resolveDegraded, toBlastRadiusResponse } from './helpers.js';
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

    const degradedInfo = resolveDegraded({ flagOn, state, filesCount: files.length, result });
    const response = toBlastRadiusResponse(prId, result, degradedInfo, state);

    log?.info(
      {
        prId,
        repoId: pull.repoId,
        source: usable ? BLAST_SOURCE.index : BLAST_SOURCE.skipped,
        indexStatus: state?.status ?? null,
        files: files.length,
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
