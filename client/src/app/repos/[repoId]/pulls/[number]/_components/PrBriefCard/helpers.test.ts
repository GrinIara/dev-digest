import { describe, it, expect } from "vitest";
import { BriefMissingReason, type Risk } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { formatCost, formatTokens, missingInputKey, refPath, relativeTime, sortRisks } from "./helpers";

const risk = (title: string, severity: Risk["severity"]): Risk => ({
  kind: "k",
  title,
  explanation: "e",
  severity,
  file_refs: ["a.ts"],
});

describe("SPEC-2026-09-30-pr-risk-brief", () => {
  it("AC-21: risks are ordered high, medium, low and keep model order within a severity", () => {
    const sorted = sortRisks([risk("l1", "low"), risk("h1", "high"), risk("m1", "medium"), risk("h2", "high"), risk("l2", "low")]);
    expect(sorted.map((r) => r.title)).toEqual(["h1", "h2", "m1", "l1", "l2"]);
  });

  it("formats tokens, cost and relative time", () => {
    expect(formatTokens(8200)).toBe("8.2K");
    expect(formatTokens(950)).toBe("950");
    expect(formatCost(0.014)).toBe("$0.014");
    const now = Date.parse("2026-09-30T12:00:00Z");
    expect(relativeTime("2026-09-30T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-30T11:59:50Z", now)).toMatch(/seconds? ago|now/);
  });

  it("refPath strips a line or range suffix only", () => {
    expect(refPath("src/a.ts:12-20")).toBe("src/a.ts");
    expect(refPath("src/a.ts:12")).toBe("src/a.ts");
    expect(refPath("src/a:b.ts")).toBe("src/a:b.ts");
  });

  it("every BriefMissingReason has a label for each input that can carry it", () => {
    const labels = messages.missing as Record<string, Record<string, string>>;
    const byInput: Record<string, string[]> = {
      intent: ["not_classified"],
      blast: ["flag_off", "index_failed", "index_partial", "repo_too_large", "no_data"],
      specs: ["none_attached", "not_cloned", "doc_missing"],
      issue: ["none_linked", "unreachable", "unsupported"],
    };
    const covered = new Set<string>();
    for (const [input, reasons] of Object.entries(byInput)) {
      for (const reason of reasons) {
        expect(missingInputKey({ input: input as "intent", reason: reason as "flag_off" })).toBe(`missing.${input}.${reason}`);
        expect(labels[input]?.[reason]).toBeTruthy();
        covered.add(reason);
      }
    }
    expect([...covered].sort()).toEqual([...BriefMissingReason.options].sort());
  });
});
