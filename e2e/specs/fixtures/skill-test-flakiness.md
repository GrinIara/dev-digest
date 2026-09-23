---
name: test-flakiness
description: Flags tests likely to fail intermittently — real timers, wall-clock reads, shared mutable state, unseeded randomness, or unmocked network/filesystem calls.
---
# Test flakiness

A test that passes most of the time but fails under load, on CI, or on a slow
machine is worse than no test — it trains the team to ignore red pipelines.
Flag any new or changed test that introduces one of these risks.

## What to flag

- **Real timers instead of fake ones** — `setTimeout`/`setInterval` awaited
  directly in a test, rather than `vi.useFakeTimers()` / `jest.useFakeTimers()`
  + `advanceTimersByTime`. A real 50ms sleep is a flake waiting for a slow CI
  runner.
- **Wall-clock reads** — `new Date()` / `Date.now()` read inside the code under
  test AND asserted on directly, instead of injecting/mocking a clock. A test
  that compares "now" to a stored timestamp will occasionally straddle a
  boundary (midnight, a leap second, a slow CI box) and fail.
- **Shared mutable state across tests** — a module-level counter, cache, or
  in-memory array that isn't reset in `beforeEach`/`afterEach`. Passes in
  isolation, fails depending on run order or `--shuffle`.
- **Unseeded randomness** — `Math.random()`, `crypto.randomUUID()`, or a
  fixture factory that generates random data without a fixed seed, where the
  assertion depends on the specific value generated.
- **Unmocked network / filesystem / real DB calls** in a unit test — anything
  that can time out, get rate-limited, or depend on external state the test
  doesn't control. (A real DB in an `*.it.test.ts` via Testcontainers is fine;
  a "unit" test silently hitting the network is not.)
- **Async races** — asserting before a promise/microtask/event has settled
  (missing `await`, a callback-based API not wrapped in a promise, a
  `setTimeout(fn, 0)` used as a makeshift "wait for next tick").
- **Order-dependent assertions** — asserting on the order of items returned
  from a Set, Map, or an unordered query result without an explicit `ORDER BY`
  / sort.

## What NOT to flag

- Fake timers, seeded RNGs, injected clocks, or Testcontainers-backed
  integration tests — these are the FIX, not the problem.
- A slow-but-deterministic test (e.g., a large fixture) is a performance
  concern, not a flakiness one — don't conflate the two.

## Severity

Any confirmed real-timer wait, wall-clock assertion without an injected clock,
or unmocked external call in a unit test is at least a WARNING; a shared
mutable-state bug that can silently pass or fail depending on test run order
is CRITICAL — it can mask a real regression indefinitely.
