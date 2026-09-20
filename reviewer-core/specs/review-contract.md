# reviewer-core — Spec: the Finding/Review contract & CI gate

This is the contract that must stay true for any consumer of `reviewPullRequest`'s output (the server, or the CI runner).

## The `Finding` shape

```ts
{
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  category: 'bug' | 'security' | 'perf' | 'style' | 'test';
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;      // markdown
  suggestion?: string | null;   // markdown
  confidence: number;      // 0..1
  kind?: 'finding' | 'secret_leak' | 'lethal_trifecta' | 'phantom' | 'hook';
  trifecta_components?: ('private_data_access' | 'untrusted_input' | 'exfil_path')[] | null;
  evidence?: { component, file, line }[] | null;
}
```

A finding that survives grounding always has a `start_line`/`end_line` that intersects a real diff hunk in `file` — **unless** `kind` is one of the `FULL_FILE_KINDS` (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`), in which case only `file` needs to appear in the diff.

## The `Review` shape

```ts
{ verdict: 'request_changes' | 'approve' | 'comment'; summary: string; score: number /* 0-100 */; findings: Finding[] }
```

Invariant enforced by grounding + `scoreFromFindings`, not by the model: **if `findings` is empty, `score` is 90 or above.** The model may violate this in its raw output; the engine's post-grounding recompute is what's trusted, never the model's self-reported `score`.

## The CI gate contract

- Severity has a fixed rank: `SUGGESTION < WARNING < CRITICAL` (`SEV_RANK`).
- `FAIL_ON_MIN_RANK` maps a CI-fail-on setting to a minimum rank: `never` → nothing fails; `critical` → only `CRITICAL` findings trigger; `warning` → `WARNING` and above; `any` → any finding at all.
- `gateTriggered(findings, failOn)` returns true iff at least one finding's rank meets or exceeds the configured minimum.
- `countBlockers(findings, failOn)` returns the count of findings that meet that bar — this is the number the server persists as `agent_runs.blockers` and the UI shows as "N blockers". It is computed purely from `findings` + the agent's configured `ciFailOn`, **never** from the model's `verdict` field. A model can return `verdict: 'approve'` while still having findings that trip the gate (and vice versa) — the two are intentionally decoupled.

## Grounding is mandatory, not optional

`groundFindings` runs on every review, unconditionally — there is no flag to skip it. A finding that cites a line outside the diff is dropped silently (not surfaced as an error); `groundingSummary` reports the kept/dropped ratio (e.g. `"1/2 passed"`) for observability, but grounding itself cannot be disabled.
