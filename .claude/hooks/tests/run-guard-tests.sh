#!/usr/bin/env bash
# Dry-run harness for the subagent guard hooks in .claude/hooks/.
# Pipes PreToolUse JSON into each guard and asserts the exit code (0 = allow, 2 = block).
# Run after any guard edit:  bash .claude/hooks/tests/run-guard-tests.sh

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="$(git -C "$here" rev-parse --show-toplevel)"
H="$R/.claude/hooks"
export CLAUDE_PROJECT_DIR="$R"

pass=0
fail=0

bash_json()  { jq -n --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}'; }
write_json() { jq -n --arg p "$1" --arg c "${2:-export {}}" '{tool_name: "Write", tool_input: {file_path: $p, content: $c}}'; }
edit_json()  { jq -n --arg p "$1" --arg n "${2:-x}" '{tool_name: "Edit", tool_input: {file_path: $p, old_string: "a", new_string: $n}}'; }

# expect <0|2> <label> <json> <guard> [guard args...]
expect() {
  local want="$1" label="$2" json="$3"
  shift 3
  local err got
  err="$("$@" <<<"$json" 2>&1 >/dev/null)"
  got=$?
  if [[ "$got" == "$want" ]]; then
    echo "PASS $label"
    pass=$((pass + 1))
  else
    echo "FAIL $label (want $want, got $got) ${err:+— $err}"
    fail=$((fail + 1))
  fi
}

RO=("$H/readonly-guard.sh" architecture-reviewer)
RV=("$H/readonly-guard.sh" plan-verifier --verify)
TW=("$H/test-writer-guard.sh")
DW=("$H/doc-writer-guard.sh")

echo "## readonly-guard (base)"
expect 0 "ro allow git diff range"   "$(bash_json 'git diff main...HEAD')" "${RO[@]}"
expect 0 "ro allow git merge-base"   "$(bash_json 'git merge-base HEAD main')" "${RO[@]}"
expect 0 "ro allow grep -e"          "$(bash_json 'grep -rn -e drizzle-orm -e db/schema server/src/modules')" "${RO[@]}"
expect 0 "ro allow diff -r vendor"   "$(bash_json 'diff -r server/src/vendor/shared client/src/vendor/shared')" "${RO[@]}"
expect 0 "ro allow cd && ls"         "$(bash_json 'cd server && ls')" "${RO[@]}"
expect 0 "ro allow pipe to head"     "$(bash_json 'git log --oneline 2>/dev/null | head -5')" "${RO[@]}"
expect 2 "ro block Write"            "$(write_json "$R/docs/x.md")" "${RO[@]}"
expect 2 "ro block Edit"             "$(edit_json "$R/docs/x.md")" "${RO[@]}"
expect 2 "ro block rm -rf"           "$(bash_json 'rm -rf x')" "${RO[@]}"
expect 2 "ro block git commit"       "$(bash_json 'git commit -m x')" "${RO[@]}"
expect 2 "ro block redirect"         "$(bash_json 'echo x > f')" "${RO[@]}"
expect 2 "ro block \$( )"            "$(bash_json 'ls $(pwd)')" "${RO[@]}"
expect 2 "ro block sed -i"           "$(bash_json 'sed -i s/a/b/ f')" "${RO[@]}"
expect 2 "ro block find -delete"     "$(bash_json 'find . -delete')" "${RO[@]}"
expect 2 "ro block awk"              "$(bash_json "awk '{print}' f")" "${RO[@]}"
expect 2 "ro block pnpm test (base)" "$(bash_json 'cd server && pnpm test')" "${RO[@]}"
expect 2 "ro block git push"         "$(bash_json 'git push origin HEAD')" "${RO[@]}"
expect 2 "ro block git reset --hard" "$(bash_json 'git reset --hard HEAD')" "${RO[@]}"
expect 2 "ro block git -C"           "$(bash_json 'git -C server status')" "${RO[@]}"
expect 2 "ro block docker"           "$(bash_json 'docker compose down -v')" "${RO[@]}"
expect 2 "ro block tee"              "$(bash_json 'ls | tee out.txt')" "${RO[@]}"

echo "## readonly-guard (--verify)"
expect 0 "rv allow pnpm typecheck"   "$(bash_json 'cd server && pnpm typecheck')" "${RV[@]}"
expect 0 "rv allow vitest --exclude" "$(bash_json "cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'")" "${RV[@]}"
expect 0 "rv allow reviewer-core npm test" "$(bash_json 'cd reviewer-core && npm test')" "${RV[@]}"
expect 0 "rv allow client lint"      "$(bash_json 'cd client && pnpm lint')" "${RV[@]}"
expect 0 "rv allow e2e typecheck"    "$(bash_json 'cd e2e && npm run typecheck')" "${RV[@]}"
expect 0 "rv allow tsc --noEmit"     "$(bash_json 'cd server && pnpm exec tsc --noEmit 2>&1 | tail -10')" "${RV[@]}"
expect 2 "rv block e2e npm test"     "$(bash_json 'cd e2e && npm test')" "${RV[@]}"
expect 2 "rv block e2e:hermetic"     "$(bash_json 'npm run e2e:hermetic')" "${RV[@]}"
expect 2 "rv block vitest -u"        "$(bash_json 'pnpm exec vitest run -u')" "${RV[@]}"
expect 2 "rv block lint --fix"       "$(bash_json 'pnpm lint --fix')" "${RV[@]}"
expect 2 "rv block pnpm install"     "$(bash_json 'pnpm install')" "${RV[@]}"
expect 2 "rv block db:migrate"       "$(bash_json 'pnpm db:migrate')" "${RV[@]}"
expect 2 "rv block npx"              "$(bash_json 'npx depcruise src')" "${RV[@]}"
expect 2 "rv block --outputFile"     "$(bash_json 'pnpm test --reporter=json --outputFile=x')" "${RV[@]}"
expect 2 "rv block --watch"          "$(bash_json 'cd client && pnpm exec vitest run --watch')" "${RV[@]}"
expect 2 "rv block --update"         "$(bash_json 'cd server && pnpm test --update')" "${RV[@]}"
expect 2 "rv block pnpm add"         "$(bash_json 'pnpm add left-pad')" "${RV[@]}"
expect 2 "rv block npm run build"    "$(bash_json 'npm run build')" "${RV[@]}"
expect 2 "rv block git push"         "$(bash_json 'cd server && pnpm test && git push')" "${RV[@]}"
expect 2 "rv block Write"            "$(write_json "$R/server/src/app.ts")" "${RV[@]}"

echo "## test-writer-guard"
expect 0 "tw allow client [repoId] test" "$(write_json "$R/client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx")" "${TW[@]}"
expect 0 "tw allow server unit test"     "$(write_json "$R/server/test/foo.test.ts" "import { x } from '../src/x.js'")" "${TW[@]}"
expect 0 "tw allow server it test + pg"  "$(write_json "$R/server/test/foo.it.test.ts" "import { startPg } from './helpers/pg.js'")" "${TW[@]}"
expect 0 "tw allow server test helper"   "$(write_json "$R/server/test/helpers/fixtures.ts")" "${TW[@]}"
expect 0 "tw allow reviewer-core test"   "$(write_json "$R/reviewer-core/test/x.test.ts")" "${TW[@]}"
expect 0 "tw allow colocated server test" "$(write_json "$R/server/src/modules/pulls/service.test.ts")" "${TW[@]}"
expect 0 "tw allow react-query retry:false" "$(write_json "$R/client/src/lib/x.test.ts" "new QueryClient({ defaultOptions: { queries: { retry: false } } })")" "${TW[@]}"
expect 0 "tw allow describe.skip gate"   "$(edit_json "$R/server/test/foo.it.test.ts" "const d = ok ? describe : describe.skip")" "${TW[@]}"
expect 0 "tw allow pnpm test"            "$(bash_json 'cd client && pnpm test')" "${TW[@]}"
expect 0 "tw allow vitest | tail"        "$(bash_json 'cd server && pnpm exec vitest run test/foo.test.ts 2>&1 | tail -20')" "${TW[@]}"
expect 2 "tw block client product code"  "$(write_json "$R/client/src/lib/api.ts")" "${TW[@]}"
expect 2 "tw block server product code"  "$(write_json "$R/server/src/app.ts")" "${TW[@]}"
expect 2 "tw block helpers/pg.ts"        "$(write_json "$R/server/test/helpers/pg.ts")" "${TW[@]}"
expect 2 "tw block client test setup"    "$(write_json "$R/client/src/test/setup.ts")" "${TW[@]}"
expect 2 "tw block .. traversal"         "$(write_json "$R/server/test/../src/app.ts")" "${TW[@]}"
expect 2 "tw block outside repo"         "$(write_json "/tmp/x.test.ts")" "${TW[@]}"
expect 2 "tw block pg in non-it test"    "$(write_json "$R/server/test/foo.test.ts" "import { startPg } from './helpers/pg.js'")" "${TW[@]}"
expect 2 "tw block it.only"              "$(edit_json "$R/server/test/foo.test.ts" "it.only('x', () => {})")" "${TW[@]}"
expect 2 "tw block @ts-expect-error"     "$(write_json "$R/client/src/lib/x.test.ts" "// @ts-expect-error")" "${TW[@]}"
expect 2 "tw block @ts-ignore"           "$(write_json "$R/client/src/lib/x.test.ts" "// @ts-ignore")" "${TW[@]}"
expect 2 "tw block eslint-disable"       "$(write_json "$R/client/src/lib/x.test.ts" "/* eslint-disable */")" "${TW[@]}"
expect 2 "tw block retry: 3"             "$(write_json "$R/client/src/lib/x.test.ts" "it('x', { retry: 3 }, () => {})")" "${TW[@]}"
expect 2 "tw block pnpm add"             "$(bash_json 'pnpm add msw')" "${TW[@]}"
expect 2 "tw block vitest -u"            "$(bash_json 'pnpm exec vitest run -u')" "${TW[@]}"
expect 2 "tw block git commit"           "$(bash_json 'git commit -m x')" "${TW[@]}"
expect 2 "tw block e2e npm test"         "$(bash_json 'cd e2e && npm test')" "${TW[@]}"
expect 2 "tw block e2e:hermetic"         "$(bash_json 'cd e2e && npm run e2e:hermetic')" "${TW[@]}"
expect 2 "tw block redirect write"       "$(bash_json 'echo x > client/src/lib/api.ts')" "${TW[@]}"
expect 2 "tw block db:seed"              "$(bash_json 'pnpm db:seed')" "${TW[@]}"
expect 2 "tw block npx"                  "$(bash_json 'npx vitest run')" "${TW[@]}"
expect 2 "tw block sed -i"               "$(bash_json 'sed -i s/a/b/ server/src/app.ts')" "${TW[@]}"
expect 2 "tw block cp"                   "$(bash_json 'cp a.ts server/src/app.ts')" "${TW[@]}"
expect 2 "tw block node -e"              "$(bash_json "node -e \"require('fs').writeFileSync('x','')\"")" "${TW[@]}"
expect 2 "tw block python -c"            "$(bash_json "python3 -c 'open(\"x\",\"w\")'")" "${TW[@]}"
expect 2 "tw block rm"                   "$(bash_json 'rm server/test/foo.test.ts')" "${TW[@]}"
expect 2 "tw block git push"             "$(bash_json 'git push')" "${TW[@]}"
expect 2 "tw block git reset --hard"     "$(bash_json 'git reset --hard')" "${TW[@]}"
expect 2 "tw block git checkout"         "$(bash_json 'git checkout -- server/src/app.ts')" "${TW[@]}"
expect 2 "tw block docker compose down"  "$(bash_json 'docker compose down -v')" "${TW[@]}"
expect 2 "tw block docker volume rm"     "$(bash_json 'docker volume rm devdigest_pgdata')" "${TW[@]}"
expect 2 "tw block db:migrate"           "$(bash_json 'cd server && pnpm db:migrate')" "${TW[@]}"
expect 2 "tw block tee"                  "$(bash_json 'echo x | tee server/src/app.ts')" "${TW[@]}"
expect 2 "tw block mv"                   "$(bash_json 'mv a.ts server/src/app.ts')" "${TW[@]}"
expect 2 "tw block touch"                "$(bash_json 'touch server/src/new.ts')" "${TW[@]}"
expect 2 "tw block truncate"             "$(bash_json 'truncate -s 0 server/src/app.ts')" "${TW[@]}"
expect 2 "tw block gh pr"                "$(bash_json 'gh pr create')" "${TW[@]}"

echo "## doc-writer-guard"
expect 0 "dw allow docs/README.md"       "$(write_json "$R/docs/README.md")" "${DW[@]}"
expect 0 "dw allow ADR"                  "$(write_json "$R/docs/adr/0002-x.md")" "${DW[@]}"
expect 0 "dw allow explanation"          "$(write_json "$R/docs/explanation/review-pipeline.md")" "${DW[@]}"
expect 0 "dw allow server/docs"          "$(edit_json "$R/server/docs/architecture.md")" "${DW[@]}"
expect 0 "dw allow server/specs"         "$(write_json "$R/server/specs/review-flow.md")" "${DW[@]}"
expect 0 "dw ignores Bash (other matcher)" "$(bash_json 'rm -rf x')" "${DW[@]}"
expect 2 "dw block docs/plans"           "$(write_json "$R/docs/plans/x.md")" "${DW[@]}"
expect 2 "dw block agent-prompts"        "$(write_json "$R/docs/agent-prompts/general-reviewer.md")" "${DW[@]}"
expect 2 "dw block AGENTS.md"            "$(edit_json "$R/server/AGENTS.md")" "${DW[@]}"
expect 2 "dw block CLAUDE.md"            "$(edit_json "$R/client/CLAUDE.md")" "${DW[@]}"
expect 2 "dw block Insights.md"          "$(edit_json "$R/client/Insights.md")" "${DW[@]}"
expect 2 "dw block Insights in docs/"    "$(write_json "$R/docs/Insights-archive.md")" "${DW[@]}"
expect 2 "dw block root README"          "$(edit_json "$R/README.md")" "${DW[@]}"
expect 2 "dw block e2e flow json"        "$(write_json "$R/e2e/specs/01-app-boot.flow.json")" "${DW[@]}"
expect 2 "dw block non-md"               "$(write_json "$R/docs/x.txt")" "${DW[@]}"
expect 2 "dw block .. traversal"         "$(write_json "$R/docs/../server/src/app.ts")" "${DW[@]}"
expect 2 "dw block product code"         "$(write_json "$R/server/src/app.ts")" "${DW[@]}"

echo
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
