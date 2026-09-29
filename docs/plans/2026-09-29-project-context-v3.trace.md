# Implement run — Project Context: attach repo Markdown docs to agents and skills
Spec: specs/SPEC-2026-09-29-project-context.md (approved) · Plan: docs/plans/2026-09-29-project-context-v3.md · Branch: feat/L05_Spec_Driven_Development · Base sha: 4a2543af4c8e4a709eb0c8e0ebaa42b2f5bac87e · Mode: multi-agent · Tests: test-writer skipped

Pre-existing user files (not part of this run): mcp-server/pnpm-lock.yaml, mcp-server/pnpm-workspace.yaml

| Phase | Status | Agent calls | Result |
|---|---|---|---|
| 1 Implement | done | implementer ×10 (+1 fix call), mechanical-checker ×8 | gates green on working tree over base 4a2543a (67 changed files, uncommitted) |
| 2 Completeness | done | plan-verifier ×1 | plan 100 Met / 2 Partial (T2.Owned, T8.Owned — scope only, accepted by user) / 0 Missing / 1 Unverifiable (R23); spec 43 Met (AC-1 via D1) / 18 Unverifiable / 0 Missing |
| 3 Review | done | architecture-reviewer, security-reviewer | architecture: pass-with-findings (2 minor, 1 nit); security: pass (0 high-confidence, 2 needs-manual-verification) |
| 4 Fix iterations | done | architecture: 1 iteration; security: 1 iteration; implementer fix calls ×4 (server findings, resync req.log, 2× trace-race test fix) | clean. Post-fix gate: shared-sync ok, client 194, reviewer-core 94; server 1st run 1 failed (AC-38/39 trace race: run-executor writes status 'done' before saveRunTrace — pre-existing ordering) → test now polls trace (project-context-run + project-context-edit .it tests) → server full re-run 338/338 green |
| 5 Final verification | done | plan-verifier ×1 (full mode, no-tests) | verified — plan 100 Met (incl. T2/T8 Owned as accepted deviations) / 0 Partial / 0 Missing / 1 Unverifiable (R23); spec 61 ACs: 43 Met (AC-1 via D1) / 18 Unverifiable (e2e + AC-44) / 0 Missing. Gates (run by verifier): shared-sync ok, server 338, client 194, reviewer-core 94 |
| 6 Close | done | | ready for manual checks; nothing committed |

### Phase 1 waves
| Wave | Tasks | Status | Gate |
|---|---|---|---|
| W1 | T1 | done (7 files, no deviations) | green: shared-sync, server 284 tests, client 146, reviewer-core 89 |
| W2 | T2, T7 | done. T7 deviations: fireEvent instead of userEvent (not installed); extra i18n keys; T7 did not load next/react/RTL skills; no tests yet for agent/skill hooks | 1st: G.server red (5 tests in server/test/prompt-{callers,structured}.test.ts used old specs string[]; server tsconfig excludes test/) → fix call 1 → re-run green (server 284, reviewer-core 94, client 161, shared-sync ok) |
| W3 | T3, T8 | done. T3: migration 0015_certain_argent.sql (not applied to dev DB), no deviations; flags lstat→rename TOCTOU window + no config-parse test. T8 deviations: edited outside Owned paths `client/src/app/agents/[id]/page.tsx` (VALID_TABS += context) and `AgentEditor.test.tsx` (smoke test expected no Context tab) — accepted by orchestrator as necessary, reviewers to confirm; native disabled checkbox for inherited rows (kit Checkbox lacks disabled); 4 mandatory skills not loaded via Skill tool | green: shared-sync, server 297 (39 files), client 185 |
| W4 | T4, T9 | done. T4: no deviations; extra isSafePath layer in helpers; flags discovery perf on cache miss, no token-cache eviction test. T9: kit Modal lacks aria-labelledby, AC-49 test asserts title via within(dialog) instead of dialog name (vendor/ui not owned) | green: shared-sync, server 314 (41 files), client 188 |
| W5 | T5, T10 | done. T5: no deviations; failure/cancel trace path untested (review by reading). T10: +3 i18n keys; Textarea wrapped in <label> (kit lacks aria-label); prettier reformat noise in useBlastResync.ts; beforeunload untested | green: shared-sync, client 194; server 313 passed + test/intent.it.test.ts failed with testcontainers "No host port found" (environmental) → re-run in isolation 6/6 passed |
| W6 | T6 | done, no deviations (IT fixture uses .devdigest/specs/a.md instead of specs/a.md); REC-6 via getRepoBasicsInWorkspace; repo-intel service imports isDiscoverable from project-context/helpers | green (all gates, end of Phase 1): shared-sync, server 333 (43 files), client 194, reviewer-core 94 |

## Findings ledger
| ID | Source | Severity | Iteration found | Decision (fix / accepted: reason / nit-skipped) | Resolved in iteration |
|---|---|---|---|---|---|
| AB3-1 | architecture | minor | 1 | fix (user) — move RepoDocs port + RepoDocPathError to adapters/repo-docs/port.ts | 1 (delta re-review: resolved) |
| AB9-1 | architecture | minor | 1 | fix (user) — move isDiscoverable/discovery rules to a neutral shared module (modules/_shared/project-docs.ts) | 1 (delta re-review: resolved) |
| FC8-1 | architecture | nit | 1 | fix requested; implementer: not fixed — 6 of 7 sibling client/src/components/* folders use a top-level index.ts barrel, so this matches convention → accepted: matches existing convention (don't re-flag) | — |
| PV-1 | plan-verifier + security §6 | minor | 1 | fix (user) — resolveForRun: per-doc catch of RepoDocPathError → unreadable, not whole context dropped | 1 (delta re-review: resolved, fails closed) |
| SEC-N1 | security delta §5/§6 | nit (low confidence) | 2 | nit-skipped — get/setAgentContext, get/setSkillContext call discover() without guardRepoDocs (defence in depth); UNSAFE_PATH_CHARS duplicated in adapter + _shared; ErrorLog type declared twice | — |
| NMV-1 | security | needs judgement (TOCTOU lstat→readFile/rename) | 1 | accepted: tradeoff — microsecond window, resync is user-triggered (user decision) | — |
| NMV-2 | security | needs judgement (raw fs/git error messages to client) | 1 | fix (user) — guardRepoDocs → ExternalServiceError, original logged; resync route passes req.log | 1 (delta re-review: resolved) |
| SEC-OOS-1 | security | out of scope | 1 | not in this run — pre-existing AgentsService.linkSkill lacks workspace check on skillId | — |

## For the user
- Unverifiable (browser, `./scripts/dev.sh`): AC-3, 6, 8, 12, 13, 15, 16, 21, 22, 24, 26, 29, 48, 49, 52, 58, 63 — RTL tests exist and pass; confirm in a real browser (real HTML5 drag, reload persistence, Refresh after a real file change, sidebar repo switch, real resync dialog cancel/confirm, run drawer Specs read + modal).
- Unverifiable (manual LLM): AC-44 / R23 — attach "module api/ does not import db/ directly", open a PR adding a db/ import in api/, run the review, expect a finding citing specs/<fixture>.md.
- Not gated: NFR-1 / NFR-2 timing on a large repo; NFR-6 contrast / target sizes.
- ACs without tests: AC-44 only (manual). test-writer was skipped; every other AC has an implementer-written AC test. Note: project-context.it.test.ts and project-context-edit.it.test.ts describes are not named `SPEC-2026-09-29-project-context`, and several tests combine ACs in one name (AC-40/41/45 etc.), so per-AC grep misses them.
- Spec: before `Status: implemented`, decide whether to record deviation D1 (README.md discovery vs AC-1) in a superseding spec via spec-creator.
- Follow-ups (out of scope, pre-existing): AgentsService.linkSkill lacks a workspace check on skillId; run-executor writes status 'done' before saveRunTrace, and intent.it.test.ts / reviews.it.test.ts read the trace right after waitForPrRuns (latent flake); kit Modal lacks aria-labelledby and kit Textarea lacks aria-label; server tsconfig excludes test/ from typecheck; @testing-library/user-event not installed.
- Stale plan versions docs/plans/2026-09-29-project-context.md and -v2.md can be deleted.
