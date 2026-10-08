#!/usr/bin/env bash
# collect.sh — compact per-agent metrics for one Claude Code session, so the
# retro never loads raw JSONL transcripts into context.
#
# Usage: collect.sh <session-id | path/to/<session-id>.jsonl> [--since ISO-8601]
# Output: Markdown sections on stdout (timeline, usage, tools, friction, overlap).
set -euo pipefail

arg="${1:?usage: collect.sh <session-id|session.jsonl> [--since ISO]}"
since=""
[[ "${2:-}" == "--since" ]] && since="${3:?--since needs a timestamp}"

cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
if [[ -f "$arg" ]]; then
  main="$arg"
else
  main=$(ls "$cfg"/projects/*/"$arg".jsonl 2>/dev/null | head -1 || true)
fi
[[ -n "${main:-}" && -f "$main" ]] || { echo "session transcript not found: $arg (config dir: $cfg)" >&2; exit 1; }
sub="${main%.jsonl}/subagents"

# Filter by --since: keep lines with timestamp >= since (or no timestamp).
flt='select(($since == "") or ((.timestamp // "") >= $since))'

usage() { # $1 = jsonl → one JSON object of de-duplicated usage
  jq -s --arg since "$since" "map($flt) | map(select(.type==\"assistant\" and .message.usage)) | group_by(.message.id) | map(last) | {
    msgs: length,
    models: (map(.message.model) | unique | join(\",\")),
    in: (map(.message.usage.input_tokens // 0) | add // 0),
    out: (map(.message.usage.output_tokens // 0) | add // 0),
    cache_read: (map(.message.usage.cache_read_input_tokens // 0) | add // 0),
    cache_write: (map(.message.usage.cache_creation_input_tokens // 0) | add // 0),
    start: (map(.timestamp) | min // \"\"), end: (map(.timestamp) | max // \"\")}" "$1"
}

echo "# Session metrics"
echo "Main transcript: \`$main\`${since:+ · since $since}"
echo

echo "## Main session (orchestrator)"
usage "$main" | jq -r '"- messages \(.msgs) · models \(.models) · in \(.in) · out \(.out) · cache read \(.cache_read) · cache write \(.cache_write) · \(.start) → \(.end)"'
echo

echo "## Agents (ordered by first activity)"
echo "| # | Agent type | Description | Depth | Stopped by user | Model | Msgs | Out | Cache read | Cache write | Start | End | Min | Resumes | Tool calls |"
echo "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"
if [[ -d "$sub" ]]; then
  for f in "$sub"/agent-*.jsonl; do
    id=$(basename "$f" .jsonl); meta="$sub/$id.meta.json"
    u=$(usage "$f")
    [[ $(jq -r .msgs <<<"$u") == 0 ]] && continue
    m=$( [[ -f "$meta" ]] && cat "$meta" || echo '{}')
    # Resumes = SendMessage continuations: plain-string user turns after the first.
    resumes=$(jq -s --arg since "$since" "map($flt) | map(select(.type==\"user\" and (.message.content|type)==\"string\" and (.message.content|startswith(\"<system-reminder>\")|not) and (.message.content|startswith(\"[Image\")|not))) | (length - 1) | if . < 0 then 0 else . end" "$f")
    tools=$(jq -s --arg since "$since" "map($flt) | [.[] | select(.type==\"assistant\") | .message.content[]? | select(.type==\"tool_use\") | .name] | length" "$f")
    jq -rn --argjson u "$u" --argjson m "$m" --arg r "$resumes" --arg t "$tools" '
      def mins: if ($u.start != "" and $u.end != "") then ((($u.end|sub("\\.[0-9]+Z$";"Z")|fromdate) - ($u.start|sub("\\.[0-9]+Z$";"Z")|fromdate))/60|floor) else "" end;
      "\($u.start)\t| \($m.agentType // "?") | \($m.description // "") | \($m.spawnDepth // "?") | \($m.stoppedByUser // false) | \($u.models) | \($u.msgs) | \($u.out) | \($u.cache_read) | \($u.cache_write) | \($u.start[11:19]) | \($u.end[11:19]) | \(mins) | \($r) | \($t) |"'
  done | sort | cut -f2- | awk '{print "| " NR " " $0}'
fi
echo

echo "## Tool mix per agent"
for f in "$sub"/agent-*.jsonl; do
  [[ -f "$f" ]] || continue
  t=$(jq -r '.agentType // "?"' "${f%.jsonl}.meta.json" 2>/dev/null || echo "?")
  mix=$(jq -r --arg since "$since" "$flt | select(.type==\"assistant\") | .message.content[]? | select(.type==\"tool_use\") | .name" "$f" | sort | uniq -c | sort -rn | awk '{printf "%s %s, ", $2, $1}')
  [[ -n "$mix" ]] && echo "- **$t** ($(basename "$f" .jsonl)): ${mix%, }"
done
echo

echo "## Friction (failed tool calls, hook denials) — first 160 chars each"
for f in "$sub"/agent-*.jsonl "$main"; do
  [[ -f "$f" ]] || continue
  if [[ "$f" == "$main" ]]; then t="main"; else t=$(jq -r '.agentType // "?"' "${f%.jsonl}.meta.json" 2>/dev/null || echo "?"); fi
  jq -r --arg since "$since" --arg t "$t" "$flt | select(.type==\"user\") | .message.content[]? | select(.type==\"tool_result\" and .is_error==true) | \"- [\(\$t)] \" + ((.content|tostring|gsub(\"\\n\";\" \"))[0:160])" "$f"
done | sort | uniq -c | sort -rn | head -40
echo

echo "## Overlap — files read by more than one agent (duplicated context)"
for f in "$sub"/agent-*.jsonl; do
  [[ -f "$f" ]] || continue
  t=$(jq -r '.agentType // "?"' "${f%.jsonl}.meta.json" 2>/dev/null || echo "?")
  jq -r --arg since "$since" --arg t "$t" "$flt | select(.type==\"assistant\") | .message.content[]? | select(.type==\"tool_use\" and .name==\"Read\") | \"\(.input.file_path)\t\(\$t)\"" "$f"
done | sort -u | awk -F'\t' '{a[$1]=a[$1] (a[$1]?", ":"") $2; n[$1]++} END {for (k in a) if (n[k]>1) print "- `" k "` — " n[k] " agents: " a[k]}' | sort
echo

echo "## Same file read repeatedly within one agent (≥3 times)"
for f in "$sub"/agent-*.jsonl; do
  [[ -f "$f" ]] || continue
  t=$(jq -r '.agentType // "?"' "${f%.jsonl}.meta.json" 2>/dev/null || echo "?")
  jq -r --arg since "$since" "$flt | select(.type==\"assistant\") | .message.content[]? | select(.type==\"tool_use\" and .name==\"Read\") | .input.file_path" "$f" | sort | uniq -c | awk -v t="$t" '$1>=3 {print "- [" t "] " $2 " ×" $1}'
done
