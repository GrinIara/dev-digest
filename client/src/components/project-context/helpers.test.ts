import { describe, it, expect } from "vitest";
import { filterByPath, moveItem, togglePath, groupForSerialization, sumTokens, splitPath } from "./helpers";

const row = (path: string, type: "specs" | "docs" | "insights" | null, tokens: number | null = 10) => ({
  path,
  type,
  tokens,
  status: "present" as const,
});

describe("SPEC-2026-09-29-project-context helpers", () => {
  it("filterByPath matches case-insensitively", () => {
    const rows = [{ path: "specs/public-api.md" }, { path: "docs/guide.md" }];
    expect(filterByPath(rows, "API")).toEqual([{ path: "specs/public-api.md" }]);
    expect(filterByPath(rows, "  ")).toEqual(rows);
    expect(filterByPath(rows, "zzz")).toEqual([]);
  });

  it("moveItem swaps neighbours and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    const same = ["a", "b"];
    expect(moveItem(same, 0, -1)).toBe(same);
    expect(moveItem(same, 1, 2)).toBe(same);
  });

  it("togglePath appends on attach and removes on detach", () => {
    expect(togglePath(["a"], "b", true)).toEqual(["a", "b"]);
    expect(togglePath(["a", "b"], "b", true)).toEqual(["a", "b"]);
    expect(togglePath(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("groupForSerialization orders groups and omits empty ones", () => {
    const groups = groupForSerialization([
      row("insights/x.md", "insights"),
      row("specs/a.md", "specs"),
      row("specs/b.md", "specs"),
      row("gone.md", null),
    ]);
    expect(groups).toEqual([
      { type: "specs", paths: ["specs/a.md", "specs/b.md"] },
      { type: "insights", paths: ["insights/x.md"] },
    ]);
  });

  it("sumTokens treats null as zero", () => {
    expect(sumTokens([{ tokens: 5 }, { tokens: null }, { tokens: 7 }])).toBe(12);
  });

  it("splitPath separates folder and name", () => {
    expect(splitPath("specs/sub/a.md")).toEqual({ dir: "specs/sub", name: "a.md" });
    expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
  });
});
