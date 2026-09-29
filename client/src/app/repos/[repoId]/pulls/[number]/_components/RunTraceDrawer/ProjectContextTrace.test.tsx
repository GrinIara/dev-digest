import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./_components/TraceBody";

const SPECS_TEXT = [
  "<spec path=\"specs/security-baseline.md\">",
  "Always validate webhook signatures.",
  "</spec>",
].join("\n");

const BASE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 0, grounding: "0/0 passed" },
  prompt_assembly: { system: "sys", skills: null, memory: null, specs: SPECS_TEXT, user: "diff" },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: ["specs/security-baseline.md"],
  specs_missing: ["specs/old.md"],
  specs_tokens: { "specs/security-baseline.md": 139 },
  log: [],
};

function renderBody(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={trace} findings={[]} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SPEC-2026-09-29-project-context", () => {
  it("AC-48 lists injected specs with tokens and missing specs as skipped", () => {
    renderBody(BASE);
    expect(screen.getByText("specs/security-baseline.md · ≈ 139 tokens")).toBeInTheDocument();
    expect(screen.getByText("specs/old.md · missing — skipped")).toBeInTheDocument();
  });

  it("AC-49/AC-50 opens the untrusted-titled modal with searchable body and copies the exact block", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderBody(BASE);

    fireEvent.click(screen.getByText("Prompt assembly"));
    fireEvent.click(screen.getAllByRole("button", { name: "Open fullscreen" })[1]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("specs/security-baseline.md");
    expect(dialog).toHaveTextContent("Always validate webhook signatures.");
    expect(within(dialog).getByPlaceholderText("Search in this block…")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(SPECS_TEXT);
  });

  it("AC-51 renders 'none' for a legacy trace without specs_missing/specs_tokens", () => {
    const legacy: RunTrace = { ...BASE, specs_read: [], specs_missing: undefined, specs_tokens: undefined };
    expect(() => renderBody(legacy)).not.toThrow();
    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
