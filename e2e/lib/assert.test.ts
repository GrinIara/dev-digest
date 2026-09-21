import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveArgs,
  summarize,
  validateFlow,
  validateFixture,
  isUseStep,
  type FlowResult,
} from "./assert.js";

describe("resolveArgs", () => {
  test("substitutes {BASE} into every arg", () => {
    const out = resolveArgs(["open", "{BASE}/pulls"], "http://localhost:3000");
    assert.deepEqual(out, ["open", "http://localhost:3000/pulls"]);
  });

  test("strips a trailing slash from base before substituting", () => {
    const out = resolveArgs(["open", "{BASE}/"], "http://localhost:3000/");
    assert.deepEqual(out, ["open", "http://localhost:3000/"]);
  });

  test("strips multiple trailing slashes from base", () => {
    const out = resolveArgs(["open", "{BASE}"], "http://localhost:3000///");
    assert.deepEqual(out, ["open", "http://localhost:3000"]);
  });

  test("substitutes multiple {BASE} occurrences across args", () => {
    const out = resolveArgs(["{BASE}/a", "{BASE}/b", "{BASE}/c"], "http://x");
    assert.deepEqual(out, ["http://x/a", "http://x/b", "http://x/c"]);
  });

  test("substitutes repeated {BASE} occurrences within one arg", () => {
    const out = resolveArgs(["{BASE}{BASE}"], "http://x");
    assert.equal(out[0], "http://xhttp://x");
  });

  test("leaves args without {BASE} untouched", () => {
    const out = resolveArgs(["wait", "--text", "hello"], "http://x");
    assert.deepEqual(out, ["wait", "--text", "hello"]);
  });
});

describe("isUseStep", () => {
  test("true for a { use } step", () => {
    assert.equal(isUseStep({ use: "gotoPr482" }), true);
  });

  test("false for a concrete cmd step", () => {
    assert.equal(isUseStep({ cmd: ["open", "{BASE}/"] }), false);
  });
});

describe("validateFlow", () => {
  test("accepts a well-formed flow", () => {
    const result = validateFlow(
      { name: "example", steps: [{ cmd: ["open", "{BASE}/"], label: "open" }] },
      "example.flow.json",
    );
    assert.equal(typeof result, "object");
  });

  test("accepts a flow using a { use } step", () => {
    const result = validateFlow({ name: "example", steps: [{ use: "gotoPr482" }] }, "example.flow.json");
    assert.equal(typeof result, "object");
  });

  test("rejects non-object data", () => {
    const result = validateFlow("not an object", "bad.flow.json");
    assert.equal(typeof result, "string");
    assert.match(result as string, /invalid flow file bad\.flow\.json/);
  });

  test("rejects a missing name", () => {
    const result = validateFlow({ steps: [] }, "bad.flow.json");
    assert.match(result as string, /missing or non-string "name"/);
  });

  test("rejects a non-array steps field", () => {
    const result = validateFlow({ name: "x", steps: "nope" }, "bad.flow.json");
    assert.match(result as string, /"steps" must be an array/);
  });

  test("rejects a step with a cmd that isn't an array of strings", () => {
    const result = validateFlow({ name: "x", steps: [{ cmd: ["open", 5] }] }, "bad.flow.json");
    assert.match(result as string, /step 0 is malformed/);
  });

  test("rejects a step that is neither a use ref nor a cmd array", () => {
    const result = validateFlow({ name: "x", steps: [{ foo: "bar" }] }, "bad.flow.json");
    assert.match(result as string, /step 0 is malformed/);
  });
});

describe("validateFixture", () => {
  test("accepts a well-formed fixture", () => {
    const result = validateFixture([{ cmd: ["open", "{BASE}/"], label: "open" }], "fixtures/x.json");
    assert.equal(Array.isArray(result), true);
  });

  test("rejects a non-array fixture", () => {
    const result = validateFixture({ cmd: ["open"] }, "fixtures/x.json");
    assert.match(result as string, /expected a JSON array/);
  });

  test("rejects a fixture step missing cmd", () => {
    const result = validateFixture([{ label: "no cmd here" }], "fixtures/x.json");
    assert.match(result as string, /step 0 is malformed/);
  });
});

describe("summarize", () => {
  test("counts passed and failed flows", () => {
    const results: FlowResult[] = [
      { name: "a", ok: true, steps: [{ label: "s1", ok: true }] },
      { name: "b", ok: false, steps: [{ label: "s1", ok: false, detail: "boom" }] },
    ];
    const out = summarize(results);
    assert.match(out, /1\/2 flows passed/);
    assert.match(out, /PASS {2}a/);
    assert.match(out, /FAIL {2}b/);
  });

  test("includes failed-step detail lines but not passing-step lines", () => {
    const results: FlowResult[] = [
      {
        name: "flow",
        ok: false,
        steps: [
          { label: "ok step", ok: true },
          { label: "bad step", ok: false, detail: "timed out" },
        ],
      },
    ];
    const out = summarize(results);
    assert.match(out, /✗ bad step — timed out/);
    assert.doesNotMatch(out, /ok step/);
  });

  test("omits the detail suffix when a failed step has none", () => {
    const results: FlowResult[] = [
      { name: "flow", ok: false, steps: [{ label: "bad step", ok: false }] },
    ];
    const out = summarize(results);
    assert.match(out, /✗ bad step$/m);
  });

  test("reports 0/0 for an empty result set", () => {
    assert.match(summarize([]), /0\/0 flows passed/);
  });
});
