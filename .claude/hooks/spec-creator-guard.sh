#!/usr/bin/env bash
# PreToolUse guard for the `spec-creator` subagent (.claude/agents/spec-creator.md) — Write/Edit/Agent.
# Bash goes through `readonly-guard.sh spec-creator` (second matcher in the agent frontmatter).
# Allows:
#   - Write: create a NEW spec file `SPEC-<YYYY-MM-DD>-<slug>.md` directly in specs/ (cross-package)
#     or <package>/specs/; the content must say `Status: draft` and `Spec ID: <file name>`, and
#     the ID must be unused in every specs folder. Creating a missing specs README.md is also allowed.
#   - Edit: an existing SPEC-*.md whose current status is `draft` (never flipping it to
#     approved/implemented — that is the user's call), and the specs README.md indexes.
#   - Agent: delegate only to `researcher` or `Explore` (read-only lookups, several in parallel).
# Everything else (product code, other docs, contract specs like server/specs/review-flow.md,
# e2e flow JSON) is blocked. Exit 2 = block; stderr is fed back to the agent.

set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

block() { echo "spec-creator-guard: $1" >&2; exit 2; }

SPEC_DIRS=(specs client/specs server/specs reviewer-core/specs e2e/specs mcp-server/specs)

case "$tool" in
  Write|Edit)
    path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
    rel="${path#"$root"/}"
    [[ "$rel" == *..* || "$rel" == /* || -z "$rel" ]] && block "path must be inside the repo, without '..' (got: $path)"

    dir="${rel%/*}"
    base="${rel##*/}"
    [[ "$dir" == "$rel" ]] && dir=""
    in_spec_dir=0
    for d in "${SPEC_DIRS[@]}"; do [[ "$dir" == "$d" ]] && in_spec_dir=1; done
    [[ "$in_spec_dir" == 1 ]] || block "spec-creator may only write directly in specs/ or <package>/specs/ (got: $rel)"

    if [[ "$base" == README.md ]]; then
      if [[ "$tool" == Write && -e "$path" ]]; then
        block "$rel exists — use Edit to add an index line, don't overwrite it"
      fi
      exit 0
    fi

    [[ "$base" =~ ^SPEC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$ ]] \
      || block "spec files must be named SPEC-<YYYY-MM-DD>-<kebab-slug>.md (got: $base)"
    id="${base%.md}"

    if [[ "$tool" == Write ]]; then
      [[ -e "$path" ]] && block "$rel already exists — Write only creates new specs; Edit it if it is still a draft"
      content="$(jq -r '.tool_input.content // empty' <<<"$input")"
      grep -Eq '^Status:[[:space:]]*draft[[:space:]]*$' <<<"$content" \
        || block "a new spec must start as 'Status: draft' — approval is the user's decision"
      grep -Eq "^Spec ID:[[:space:]]*$id[[:space:]]*$" <<<"$content" \
        || block "the 'Spec ID:' line must equal the file name ($id)"
      for d in "${SPEC_DIRS[@]}"; do
        [[ -e "$root/$d/$id.md" ]] && block "$id is already used by $d/$id.md — pick a more specific slug"
      done
    else
      [[ -f "$path" ]] || block "$rel does not exist — create it with Write"
      grep -Eq '^Status:[[:space:]]*draft[[:space:]]*$' "$path" \
        || block "$rel is not a draft — write a new spec with 'Supersedes: $id' instead of editing it"
      new="$(jq -r '.tool_input.new_string // empty' <<<"$input")"
      grep -Eq 'Status:[[:space:]]*(approved|implemented)' <<<"$new" \
        && block "only the user moves a spec to approved/implemented"
    fi
    ;;

  Agent)
    type="$(jq -r '.tool_input.subagent_type // empty' <<<"$input")"
    [[ "$type" == "researcher" || "$type" == "Explore" ]] \
      || block "spec-creator may only delegate to researcher or Explore (got: ${type:-<none>})"
    ;;
esac

exit 0
