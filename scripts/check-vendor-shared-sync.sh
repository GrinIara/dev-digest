#!/usr/bin/env bash
#
# Diff server/src/vendor/shared (canonical) against client/src/vendor/shared
# (hand-mirrored copy) and fail if they've drifted.
#
# `@devdigest/shared` is vendored (copy-pasted), not path-aliased, into
# `client/` — see server/AGENTS.md's "Do not touch" section and
# server/Insights.md's 2026-09-18 "vendor/shared hand-mirrored" entry.
# TypeScript can't catch a missed side of an edit since the two are
# structurally separate packages; this script is the mechanical check that
# was missing (architecture-improvement-plan.md, server finding #12).
#
# Usage: ./scripts/check-vendor-shared-sync.sh
# Exit code: 0 if identical, 1 (with a diff) if drifted.
#
# NOT wired into CI yet (no CI config exists in this repo to safely modify) —
# run manually after any server/src/vendor/shared edit, or hook it into
# whichever CI workflow ends up covering server/ or client/.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_SHARED="$ROOT/server/src/vendor/shared"
CLIENT_SHARED="$ROOT/client/src/vendor/shared"

if [[ ! -d "$SERVER_SHARED" ]]; then
  echo "error: $SERVER_SHARED not found" >&2
  exit 2
fi
if [[ ! -d "$CLIENT_SHARED" ]]; then
  echo "error: $CLIENT_SHARED not found" >&2
  exit 2
fi

if diff -rq "$SERVER_SHARED" "$CLIENT_SHARED" >/tmp/vendor-shared-sync.diff 2>&1; then
  echo "OK: server/src/vendor/shared and client/src/vendor/shared are in sync."
  exit 0
fi

echo "server/src/vendor/shared and client/src/vendor/shared have DRIFTED:" >&2
cat /tmp/vendor-shared-sync.diff >&2
echo >&2
echo "server/src/vendor/shared is canonical — copy the drifted file(s) from there into client/src/vendor/shared." >&2
exit 1
