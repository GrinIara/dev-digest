#!/usr/bin/env bash
# PreToolUse guard for the `test-writer` subagent (.claude/agents/test-writer.md).
# Enforces what frontmatter cannot:
#   - Write/Edit only test files (client/src/**/*.test.ts(x), server/test/**, server/src/**/*.test.ts,
#     reviewer-core/test/**, reviewer-core/src/**/*.test.ts) — never product code or global test setup
#   - test content without .only, numeric retries, type/lint suppressions; DB tests named *.it.test.ts
#   - Bash without dependency changes, snapshot updates, shell writes, e2e, commits or destructive commands
# Keyword guardrails, not a sandbox. Exit 2 = block; stderr is fed back to the agent.

set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

block() { echo "test-writer-guard: $1" >&2; exit 2; }

case "$tool" in
  Write|Edit)
    path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
    rel="${path#"$root"/}"
    [[ "$rel" == *..* || "$rel" == /* || -z "$rel" ]] && block "path must be inside the repo, without '..' (got: $path)"
    case "$rel" in
      server/test/helpers/pg.ts)
        block "server/test/helpers/pg.ts is shared testcontainers setup — not a test-writer target" ;;
      client/src/test/setup.ts)
        block "client/src/test/setup.ts is global test setup — not a test-writer target" ;;
      client/src/*.test.ts|client/src/*.test.tsx|server/test/*.ts|server/src/*.test.ts|reviewer-core/test/*.ts|reviewer-core/src/*.test.ts) ;;
      *) block "test-writer may only write test files — product code is out of scope (got: $rel)" ;;
    esac

    if [[ "$tool" == "Write" ]]; then
      content="$(jq -r '.tool_input.content // empty' <<<"$input")"
    else
      content="$(jq -r '.tool_input.new_string // empty' <<<"$input")"
    fi
    re_only='\.only\('
    re_retry='(^|[^[:alnum:]_])retry:[[:space:]]*[1-9]'
    [[ "$content" =~ $re_only ]] && block ".only( is not allowed — it silently skips the rest of the suite"
    [[ "$content" == *'@ts-ignore'* || "$content" == *'@ts-expect-error'* ]] && block "type suppressions (@ts-ignore/@ts-expect-error) are not allowed"
    [[ "$content" == *'eslint-disable'* ]] && block "eslint-disable is not allowed"
    [[ "$content" =~ $re_retry ]] && block "test retries are a flakiness signal, not a fix — remove 'retry:'"
    if [[ "$rel" == server/* && "$rel" != *.it.test.ts && "$content" == *helpers/pg* ]]; then
      block "tests importing test/helpers/pg.ts must be named *.it.test.ts (server/AGENTS.md Gotchas)"
    fi
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
      '(^|[^[:alnum:]_-])rm[[:space:]]'  "rm (test-writer never deletes files — report instead)"
      '(npm|pnpm|yarn|bun)[[:space:]]+(add|install|i|remove|uninstall|update|up)([[:space:]]|$)' "dependency changes (lockfiles are do-not-touch)"
      '(^|[^[:alnum:]_-])npx[[:space:]]' "npx (may install packages) — use the package's scripts or 'pnpm exec'"
      '(^|[[:space:]])(-u|--update)([[:space:]=]|$)' "snapshot updates (-u/--update)"
      'e2e:hermetic'                     "e2e is not test-writer's suite — the user runs ./scripts/e2e.sh"
      '(^|[^[:alnum:]_-])sed[[:space:]]+-[a-zA-Z]*i' "sed -i (shell writes)"
      '(^|[^[:alnum:]_-])(tee|cp|mv|touch|truncate)([[:space:]]|$)' "shell file writes — use Write/Edit on test files"
      '(^|[^[:alnum:]_-])(node|tsx)[[:space:]]+(-e|--eval|-p|--print)' "inline node eval (can write files outside the guard)"
      '(^|[^[:alnum:]_-])(python3?|perl|ruby)([[:space:]]|$)' "python/perl/ruby (can write files outside the guard)"
    )
    for ((i = 0; i < ${#deny[@]}; i += 2)); do
      [[ "$cmd" =~ ${deny[i]} ]] && block "blocked: ${deny[i+1]}"
    done
    # e2e `npm test` runs against the user's own dev stack.
    if [[ "$cmd" =~ e2e ]] && [[ "$cmd" =~ npm[[:space:]]+(run[[:space:]]+)?test([[:space:]]|$|\;|\&) ]]; then
      block "e2e is not test-writer's suite — never 'npm test' there"
    fi
    # No redirection to files (allow discarding to /dev/null and 2>&1).
    stripped="$(sed -E 's#[0-9]*>>?[[:space:]]*/dev/null##g; s#[0-9]*>&[0-9]##g' <<<"$cmd")"
    [[ "$stripped" == *'>'* ]] && block "output redirection is not allowed — use Write/Edit on test files"
    ;;
esac

exit 0
