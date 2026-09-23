#!/usr/bin/env bash
# PreToolUse guard for the `implementer` subagent (.claude/agents/implementer.md).
# Blocks destructive / outward-facing Bash commands and edits to files that are
# generated, symlinked, or owned by someone else (see root CLAUDE.md "Do not touch").
# Owned paths per task are enforced by the agent prompt + self-check, not here.
# Exit 2 = block; stderr is fed back to the agent.

set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

block() { echo "implementer-guard: $1" >&2; exit 2; }

case "$tool" in
  Write|Edit)
    path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
    rel="${path#"$root"/}"
    case "$rel" in
      *pnpm-lock.yaml|*package-lock.json|skills-lock.json)
        block "lockfiles are generated — regenerate via install, never hand-edit ($rel)" ;;
      CLAUDE.md|*/CLAUDE.md)
        block "CLAUDE.md files are symlinks / owned by maintainers — not an implementation target ($rel)" ;;
      docker-compose.yml|*/docker-compose.yml)
        block "docker-compose.yml is off-limits for the implementer ($rel)" ;;
      .env|.env.*|*/.env|*/.env.*)
        block ".env files may hold secrets — not an implementation target ($rel)" ;;
      server/src/db/migrations/*)
        block "never hand-write migrations — generate them with 'cd server && pnpm db:generate' when the plan owns them ($rel)" ;;
      .claude/*|docs/plans/*)
        block "agent config, skills and plans are not implementation targets ($rel)" ;;
    esac
    ;;

  Bash)
    cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
    deny=(
      'docker(-| )compose[^|;&]*down'   "docker compose down (can drop the dev DB volume)"
      'docker[[:space:]]+volume[[:space:]]+rm' "docker volume rm"
      'git[[:space:]]+push'             "git push (outward-facing — leave to the user)"
      'git[[:space:]]+commit'           "git commit (the user commits)"
      'git[[:space:]]+reset[[:space:]]+--hard' "git reset --hard"
      'git[[:space:]]+(clean|rebase|stash|restore)' "git clean/rebase/stash/restore (can discard the user's work)"
      'git[[:space:]]+checkout[[:space:]]' "git checkout (switching branches or discarding files)"
      'git[[:space:]]+branch[[:space:]]+-[dD]' "git branch delete"
      'gh[[:space:]]+(pr|release|repo)'  "gh pr/release/repo (outward-facing)"
      '(npm|pnpm)[[:space:]]+publish'    "package publish"
      'db:(migrate|seed)'                "db:migrate / db:seed touch the dev DB — ask the user"
      'rm[[:space:]]+-[a-zA-Z]*r'        "recursive rm"
    )
    for ((i = 0; i < ${#deny[@]}; i += 2)); do
      [[ "$cmd" =~ ${deny[i]} ]] && block "blocked: ${deny[i+1]}"
    done
    # e2e `npm test` runs against the user's own dev stack — only the hermetic runner is allowed.
    if [[ "$cmd" =~ e2e ]] && [[ "$cmd" =~ npm[[:space:]]+(run[[:space:]]+)?test([[:space:]]|$|\;|\&) ]]; then
      block "run e2e only via 'npm run e2e:hermetic' (or ./scripts/e2e.sh)"
    fi
    # No shell writes to lockfiles.
    if [[ "$cmd" =~ (pnpm-lock\.yaml|package-lock\.json|skills-lock\.json) ]] \
       && [[ "$cmd" =~ (\>|sed[[:space:]]+-[a-zA-Z]*i|tee|mv[[:space:]]|cp[[:space:]]|rm[[:space:]]) ]]; then
      block "lockfiles must not be written from the shell"
    fi
    ;;
esac

exit 0
