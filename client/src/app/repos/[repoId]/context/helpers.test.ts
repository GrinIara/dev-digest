import { describe, it, expect } from "vitest";
import type { ContextDoc } from "@/lib/types";
import { buildDocTree, formatApproxTokens, formatRootsForEmptyState } from "./helpers";

const doc = (path: string): ContextDoc => ({
  path,
  name: path.split("/").pop() ?? path,
  dir: path.split("/").slice(0, -1).join("/"),
  type: "docs",
  tokens: 10,
  used_by: 0,
  locally_modified: false,
});

describe("buildDocTree", () => {
  it("nests files under folders, folders before files, alphabetical", () => {
    const tree = buildDocTree([
      doc("README.md"),
      doc("specs/b.md"),
      doc("specs/a.md"),
      doc("docs/api/x.md"),
    ]);
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual([
      "folder:docs",
      "folder:specs",
      "file:README.md",
    ]);
    const specs = tree[1];
    expect(specs?.kind === "folder" && specs.children.map((c) => c.name)).toEqual(["a.md", "b.md"]);
    const docs = tree[0];
    expect(docs?.kind === "folder" && docs.children[0]?.name).toBe("api");
  });

  it("returns an empty tree for no docs", () => {
    expect(buildDocTree([])).toEqual([]);
  });
});

describe("formatApproxTokens", () => {
  it("prints raw numbers below 1000 and k-suffix above", () => {
    expect(formatApproxTokens(0)).toBe("0");
    expect(formatApproxTokens(999)).toBe("999");
    expect(formatApproxTokens(1000)).toBe("1k");
    expect(formatApproxTokens(1234)).toBe("1.2k");
  });
});

describe("formatRootsForEmptyState", () => {
  it("names every root", () => {
    expect(formatRootsForEmptyState(["specs/", "docs/", "insights/", "README.md"])).toBe(
      "specs/, docs/, insights/ and README.md files",
    );
  });
  it("handles only directories", () => {
    expect(formatRootsForEmptyState(["specs/"])).toBe("specs/");
  });
});
