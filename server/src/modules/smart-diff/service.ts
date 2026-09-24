import type { Container } from '../../platform/container.js';
import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffRepository } from './repository.js';
import { buildSmartDiff } from './helpers.js';

/**
 * Smart Diff application/use-case layer. No Fastify or Drizzle imports —
 * orchestration only, mirroring `pulls/service.ts`.
 */
export class SmartDiffService {
  private repo: SmartDiffRepository;

  constructor(container: Container) {
    this.repo = new SmartDiffRepository(container.db);
  }

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPullForWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, findings] = await Promise.all([
      this.repo.getPrFiles(prId),
      this.repo.latestReviewFindingsPerAgent(prId),
    ]);

    const mapped = findings.map((f) => ({
      file: f.file,
      startLine: f.startLine,
      dismissedAt: f.dismissedAt,
    }));

    return buildSmartDiff(files, mapped);
  }
}
