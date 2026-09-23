/**
 * Strip embedded URL credentials (`https://user:token@host/...`) out of an
 * error message before it's logged or persisted.
 *
 * `repos/helpers.ts`'s `withGitHubToken()` embeds the GitHub PAT into the
 * clone URL (`https://x-access-token:<token>@github.com/...`) so `git clone`
 * authenticates non-interactively. If the clone fails, some git/network
 * errors echo the URL — including the credentials — back in the error
 * message. `JobRunner.enqueue()` (`platform/jobs.ts`) persists every job
 * failure's error message verbatim to the `jobs` table, so without this the
 * PAT could land in plaintext at rest. Applied generically to every job's
 * error message, not just `clone`, since it's a cheap no-op when no
 * credentials are present.
 */
const URL_CREDENTIALS_RE = /(https?:\/\/)[^/\s@]+@/gi;

export function redactUrlCredentials(message: string): string {
  return message.replace(URL_CREDENTIALS_RE, '$1[redacted]@');
}
