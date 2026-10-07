import { AppError, ExternalServiceError } from '../../platform/errors.js';
import { RepoDocPathError } from '../../adapters/repo-docs/port.js';

export const REPO_DOCS_UNAVAILABLE_MESSAGE = "Couldn't access repository documents";

interface ErrorLog {
  error: (obj: object, msg: string) => void;
}

/**
 * Run an adapter call against the repo clone. Unexpected failures (fs / git
 * errors whose message carries absolute clone paths) are logged server-side and
 * replaced by a generic AppError so the global handler never echoes them.
 * `RepoDocPathError` and existing AppErrors pass through untouched.
 */
export async function guardRepoDocs<T>(fn: () => Promise<T>, log?: ErrorLog): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RepoDocPathError || err instanceof AppError) throw err;
    log?.error({ err }, 'repo docs access failed');
    throw new ExternalServiceError(REPO_DOCS_UNAVAILABLE_MESSAGE);
  }
}
