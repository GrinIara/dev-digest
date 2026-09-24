import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff, SmartDiffGroup } from "@devdigest/shared";
import { SEV } from "@devdigest/ui";
import {
  selectActiveFindings,
  findingsByFile,
  findingAnnotations,
  filesWithFindings,
  resolveSmartGroups,
  markedPathsFrom,
  diffTotals,
} from "./helpers";

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 7,
    end_line: 7,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "agentA",
    run_id: null,
    agent_name: "Security",
    kind: "review",
    verdict: "approve",
    summary: "ok",
    score: 90,
    model: "gpt-4.1",
    grounding: null,
    created_at: "2026-06-01T00:00:00Z",
    findings: [],
    ...overrides,
  };
}

function prFile(path: string, overrides: Partial<PrFile> = {}): PrFile {
  return { path, additions: 1, deletions: 0, patch: null, ...overrides };
}

describe("findingAnnotations", () => {
  it("keys annotations by RIGHT:start_line, maps colors from SEV, mutes dismissed findings, and labels via labelFor", () => {
    const active = finding({ id: "f-active", severity: "WARNING", start_line: 12, dismissed_at: null });
    const dismissed = finding({ id: "f-dismissed", severity: "CRITICAL", start_line: 20, dismissed_at: "2026-06-02T00:00:00Z" });

    const map = findingAnnotations(
      [active, dismissed],
      (f) => f.id,
      (f) => `label-${f.severity}`,
    );

    expect([...map.keys()]).toEqual(["RIGHT:12", "RIGHT:20"]);
    const activeAnn = map.get("RIGHT:12")![0]!;
    expect(activeAnn.color).toBe(SEV.WARNING.c);
    expect(activeAnn.label).toBe("label-WARNING");
    expect(activeAnn.content).toBe("f-active");

    const dismissedAnn = map.get("RIGHT:20")![0]!;
    expect(dismissedAnn.color).toBe("var(--text-muted)");
  });
});

describe("selectActiveFindings", () => {
  it("keeps only the newest 'review' review per agent, treating null agent_id as one bucket, and excludes 'summary' reviews", () => {
    const fOld = finding({ id: "old", start_line: 1 });
    const fNew = finding({ id: "new", start_line: 2 });
    const fNullOld = finding({ id: "null-old", start_line: 3 });
    const fNullNew = finding({ id: "null-new", start_line: 4 });
    const fSummary = finding({ id: "summary-only", start_line: 5 });

    const reviews: ReviewRecord[] = [
      review({ id: "rA-old", agent_id: "agentA", created_at: "2026-06-01T00:00:00Z", findings: [fOld] }),
      review({ id: "rA-new", agent_id: "agentA", created_at: "2026-06-02T00:00:00Z", findings: [fNew] }),
      review({ id: "rNull-old", agent_id: null, created_at: "2026-06-01T00:00:00Z", findings: [fNullOld] }),
      review({ id: "rNull-new", agent_id: null, created_at: "2026-06-03T00:00:00Z", findings: [fNullNew] }),
      review({ id: "rSummary", agent_id: "agentA", kind: "summary", created_at: "2026-06-05T00:00:00Z", findings: [fSummary] }),
    ];

    const active = selectActiveFindings(reviews);
    const ids = active.map((f) => f.id).sort();
    expect(ids).toEqual(["new", "null-new"]);
  });
});

describe("filesWithFindings", () => {
  it("counts files with findings, not the number of findings", () => {
    const group: SmartDiffGroup = {
      role: "core",
      files: [
        { path: "a.ts", additions: 1, deletions: 0, finding_lines: [3, 7, 12] },
        { path: "b.ts", additions: 1, deletions: 0, finding_lines: [5] },
        { path: "c.ts", additions: 1, deletions: 0, finding_lines: [] },
      ],
    };
    expect(filesWithFindings(group)).toBe(2);
  });
});

describe("findingsByFile", () => {
  it("groups findings by file path", () => {
    const f1 = finding({ id: "f1", file: "a.ts" });
    const f2 = finding({ id: "f2", file: "b.ts" });
    const f3 = finding({ id: "f3", file: "a.ts" });
    const map = findingsByFile([f1, f2, f3]);
    expect(map.get("a.ts")!.map((f) => f.id)).toEqual(["f1", "f3"]);
    expect(map.get("b.ts")!.map((f) => f.id)).toEqual(["f2"]);
  });
});

describe("resolveSmartGroups", () => {
  const smart: SmartDiff = {
    groups: [
      {
        role: "core",
        files: [
          { path: "a.ts", additions: 1, deletions: 0, finding_lines: [3] },
          { path: "b.ts", additions: 1, deletions: 0, finding_lines: [] },
        ],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
  };

  it("returns null when smart is undefined", () => {
    expect(resolveSmartGroups(undefined, [prFile("a.ts")])).toBeNull();
  });

  it("returns null when the smart-diff path set doesn't match pr.files (e.g. right after a PR refresh)", () => {
    const files = [prFile("a.ts"), prFile("c.ts")]; // "b.ts" missing, "c.ts" is new
    expect(resolveSmartGroups(smart, files)).toBeNull();
  });

  it("sorts each group's files by their index in pr.files (A1)", () => {
    // pr.files lists "b.ts" before "a.ts" — the opposite of the smart-diff group order.
    const files = [prFile("b.ts"), prFile("a.ts")];
    const groups = resolveSmartGroups(smart, files);
    expect(groups).not.toBeNull();
    expect(groups![0]!.files.map((f) => f.path)).toEqual(["b.ts", "a.ts"]);
    expect(groups![0]!.withFindings).toBe(1);
  });

  it("counts files with findings, not findings (2 files, 4 finding lines → 2)", () => {
    const multi: SmartDiff = {
      ...smart,
      groups: [
        {
          role: "core",
          files: [
            { path: "a.ts", additions: 1, deletions: 0, finding_lines: [3, 7, 12] },
            { path: "b.ts", additions: 1, deletions: 0, finding_lines: [5] },
          ],
        },
      ],
    };
    expect(resolveSmartGroups(multi, [prFile("a.ts"), prFile("b.ts")])![0]!.withFindings).toBe(2);
  });
});

describe("markedPathsFrom", () => {
  it("uses the smart-diff finding_lines when available", () => {
    const smart: SmartDiff = {
      groups: [
        {
          role: "core",
          files: [
            { path: "a.ts", additions: 1, deletions: 0, finding_lines: [3] },
            { path: "b.ts", additions: 1, deletions: 0, finding_lines: [] },
          ],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
    };
    expect(markedPathsFrom(smart, [])).toEqual(new Set(["a.ts"]));
  });

  it("falls back to non-dismissed active findings when smart-diff is unavailable", () => {
    const active = finding({ file: "x.ts", dismissed_at: null });
    const dismissedFinding = finding({ file: "y.ts", dismissed_at: "2026-06-01T00:00:00Z" });
    expect(markedPathsFrom(undefined, [active, dismissedFinding])).toEqual(new Set(["x.ts"]));
  });
});

describe("diffTotals", () => {
  it("sums additions and deletions across files", () => {
    const files = [prFile("a.ts", { additions: 3, deletions: 1 }), prFile("b.ts", { additions: 5, deletions: 2 })];
    expect(diffTotals(files)).toEqual({ additions: 8, deletions: 3 });
  });
});
