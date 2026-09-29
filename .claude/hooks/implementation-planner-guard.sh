#!/usr/bin/env bash
# PreToolUse guard for the `implementation-planner` subagent (.claude/agents/implementation-planner.md).
# Enforces what frontmatter cannot:
#   - Write only to create a NEW docs/plans/*.md (no overwrite); Edit/NotebookEdit always blocked
#   - Never touches specs (specs/, <package>/specs/, SPEC-*.md) — spec work belongs to spec-creator + the user
#   - Agent only for researcher / Explore (Agent(type) lists are ignored in subagents)
#   - Bash only for read-only inspection commands
# Exit 2 = block; stderr is fed back to the agent.

set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

block() { echo "implementation-planner-guard: $1" >&2; exit 2; }

case "$tool" in
  Edit|NotebookEdit)
    block "implementation-planner cannot edit existing files — it only creates a new docs/plans/*.md with Write"
    ;;

  Write)
    path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
    rel="${path#"$root"/}"
    [[ "$rel" == specs/* || "$rel" == */specs/* || "$(basename "$rel")" == SPEC-* ]] \
      && block "implementation-planner never writes specs — that is spec-creator's job (got: $rel)"
    [[ "$rel" == docs/plans/*.md && "$rel" != *..* ]] \
      || block "implementation-planner may only write docs/plans/*.md (got: $rel)"
    [[ -e "$root/$rel" ]] \
      && block "implementation-planner may only create a new plan file, not overwrite $rel — use a new slug (e.g. -v2)"
    ;;

  Agent)
    type="$(jq -r '.tool_input.subagent_type // empty' <<<"$input")"
    [[ "$type" == "researcher" || "$type" == "Explore" ]] \
      || block "implementation-planner may only delegate to researcher or Explore (got: ${type:-<none>})"
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
        ls|cat|head|tail|wc|grep|rg|jq|pwd|tree|sort|uniq|cut|tr|echo|date|basename|dirname|file|stat) ;;
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
        *) block "command not in implementation-planner read-only allowlist: $first" ;;
      esac
    done < <(sed -E 's/(\|\||&&|;|\|)/\n/g' <<<"$cmd")
    ;;
esac

exit 0
