#!/usr/bin/env bash
# Launcher for the devdigest MCP server (stdio transport).
#
# `cd` into the package directory first so the launch is independent of the
# caller's working directory (Claude Code spawns this from the repo root via
# the root `/.mcp.json`, or from anywhere via an absolute path passed to
# `claude mcp add`). Never adds a stdout banner: stdout must carry only
# JSON-RPC once the server starts, so failures below are written to stderr.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x node_modules/.bin/tsx ]; then
  echo "devdigest MCP server: dependencies are not installed. Run: cd mcp-server && npm install" >&2
  exit 1
fi

exec node_modules/.bin/tsx --tsconfig tsconfig.json src/index.ts
