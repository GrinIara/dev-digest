#!/usr/bin/env bash
# PreToolUse guard for the `doc-writer` subagent (.claude/agents/doc-writer.md) — Write/Edit only.
# Bash goes through `readonly-guard.sh doc-writer` (second matcher in the agent frontmatter).
# Allows only *.md under docs/ and each package's docs/ + specs/, except:
#   - docs/plans/        (planner-owned inputs)
#   - docs/agent-prompts/ (originals of DB-stored prompts — change together with PUT /agents/:id)
#   - AGENTS.md / CLAUDE.md / Insights*.md anywhere (always-loaded agent context, maintainer-owned)
# Exit 2 = block; stderr is fed back to the agent.

set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

block() { echo "doc-writer-guard: $1" >&2; exit 2; }

case "$tool" in
  Write|Edit)
    path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
    rel="${path#"$root"/}"
    base="${rel##*/}"
    # Deny rules first — they win inside allowed trees.
    [[ "$rel" == *..* || "$rel" == /* || -z "$rel" ]] && block "path must be inside the repo, without '..' (got: $path)"
    [[ "$rel" == docs/plans/* ]] && block "docs/plans/ holds planner-owned plans — not a doc-writer target ($rel)"
    [[ "$rel" == docs/agent-prompts/* ]] && block "docs/agent-prompts/ are DB-prompt originals — change them with PUT /agents/:id, not here ($rel)"
    case "$base" in
      AGENTS.md|CLAUDE.md|Insights*.md)
        block "$base is always-loaded agent context — propose the edit in the Doc Report instead ($rel)" ;;
    esac
    [[ "$rel" == *.md ]] || block "doc-writer may only write Markdown (*.md) (got: $rel)"
    case "$rel" in
      docs/*|server/docs/*|client/docs/*|reviewer-core/docs/*|e2e/docs/*|server/specs/*|client/specs/*|reviewer-core/specs/*|e2e/specs/*) ;;
      *) block "doc-writer may only write under docs/ or a package's docs/ / specs/ — propose other edits in the Doc Report (got: $rel)" ;;
    esac
    ;;
esac

exit 0
