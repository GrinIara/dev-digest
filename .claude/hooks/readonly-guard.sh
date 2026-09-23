#!/usr/bin/env bash
# Shared PreToolUse guard for read-only subagents.
# Usage: readonly-guard.sh <agent-name> [--verify]
#   architecture-reviewer  → base mode
#   doc-writer             → base mode (Bash matcher only; writes go through doc-writer-guard.sh)
#   plan-verifier          → --verify (also allows the packages' existing typecheck/test/lint)
# Enforces:
#   - Write/Edit/NotebookEdit always blocked (defense-in-depth next to disallowedTools)
#   - Bash only for read-only inspection commands (same allowlist as planner-guard.sh + diff/comm)
# Known quirk: commands are split on | || && ; without honouring quotes, so
# `grep 'a\|b'` is rejected — use `grep -e a -e b`. This over-blocks (fails closed).
# Exit 2 = block; stderr is fed back to the agent.

set -euo pipefail

agent="${1:-readonly}"
mode="${2:-}"

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"

block() { echo "$agent-guard: $1" >&2; exit 2; }

# --verify: the packages' existing verification commands, never write-capable variants.
verify_ok() {
  local seg="$1" full="$2" w
  local -a words
  read -ra words <<<"$seg"
  for w in "${words[@]}"; do
    case "$w" in
      -u|--update|--update=*|--fix|--fix=*|--watch|--watch=*|-w|--outputFile|--outputFile=*|install|add|i|e2e:hermetic|db:*)
        block "not allowed in verification commands: $w" ;;
    esac
  done
  [[ "$seg" =~ ^pnpm[[:space:]]+(typecheck|test|lint)([[:space:]]|$) ]] && return 0
  [[ "$seg" =~ ^pnpm[[:space:]]+exec[[:space:]]+vitest[[:space:]]+run([[:space:]]|$) ]] && return 0
  [[ "$seg" =~ ^pnpm[[:space:]]+exec[[:space:]]+tsc[[:space:]]+--noEmit([[:space:]]|$) ]] && return 0
  [[ "$seg" =~ ^npm[[:space:]]+run[[:space:]]+(typecheck|lint|test:unit)([[:space:]]|$) ]] && return 0
  if [[ "$seg" =~ ^npm[[:space:]]+(run[[:space:]]+)?test([[:space:]]|$) ]]; then
    [[ "$full" == *e2e* ]] && block "e2e runs only via ./scripts/e2e.sh (user-run) — never 'npm test' there"
    return 0
  fi
  return 1
}

case "$tool" in
  Write|Edit|NotebookEdit)
    block "$agent is read-only ($tool is not allowed)"
    ;;

  Bash)
    cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
    # No command substitution / subshell tricks.
    [[ "$cmd" == *'$('* || "$cmd" == *'`'* ]] && block "command substitution is not allowed"
    # No redirection to files (allow discarding to /dev/null and 2>&1).
    stripped="$(sed -E 's#[0-9]*>>?[[:space:]]*/dev/null##g; s#[0-9]*>&[0-9]##g' <<<"$cmd")"
    [[ "$stripped" == *'>'* ]] && block "output redirection is not allowed"

    # Every segment of a pipeline/chain must start with an allowlisted read-only command.
    while IFS= read -r seg; do
      seg="$(sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' <<<"$seg")"
      [[ -z "$seg" ]] && continue
      # Allow a leading `cd <dir>`.
      [[ "$seg" =~ ^cd([[:space:]]|$) ]] && continue
      first="${seg%% *}"
      case "$first" in
        ls|cat|head|tail|wc|grep|rg|jq|pwd|tree|sort|uniq|cut|tr|echo|date|basename|dirname|file|stat|diff|comm) ;;
        find)
          [[ "$seg" =~ -(delete|exec|execdir|ok|fprint) ]] && block "find with -delete/-exec is not allowed"
          ;;
        sed)
          [[ "$seg" =~ (^|[[:space:]])-[a-zA-Z]*i ]] && block "sed -i is not allowed"
          ;;
        git)
          sub="$(awk '{print $2}' <<<"$seg")"
          case "$sub" in
            log|diff|status|show|blame|ls-files|grep|rev-parse|merge-base) ;;
            *) block "only read-only git subcommands are allowed (got: git $sub)" ;;
          esac
          ;;
        pnpm|npm)
          [[ "$mode" == "--verify" ]] && verify_ok "$seg" "$cmd" && continue
          block "not an allowed command for $agent: $seg"
          ;;
        *) block "command not in $agent read-only allowlist: $first" ;;
      esac
    done < <(sed -E 's/(\|\||&&|;|\|)/\n/g' <<<"$cmd")
    ;;
esac

exit 0
