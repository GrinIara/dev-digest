import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const BRIEF: PrBrief = {
  summary: "Adds rate limiting <b>to</b> the API.",
  intent: null,
  blast: null,
  risks: {
    risks: [
      { kind: "perf", title: "Low one", explanation: "low why", severity: "low", file_refs: ["src/a.ts:3"] },
      { kind: "sec", title: "High one", explanation: "high why", severity: "high", file_refs: ["src/b.ts:10-12"] },
      { kind: "x", title: "Medium one", explanation: "med why", severity: "medium", file_refs: ["src/a.ts"] },
    ],
  },
  review_focus: [
    { file: "src/a.ts", line: 12, reason: "check the limiter" },
    { file: "src/caller.ts", line: 4, reason: "caller of limiter" },
  ],
  history: { history: [] },
  missing_inputs: [{ input: "intent", status: "missing", reason: "not_classified", ref: null }],
  inputs: { specs: [], issues: [] },
  dropped: { risks: 0, focus: 0 },
  head_sha: "abc",
  generated_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  model: "gpt-x",
  provider: "openai",
  tokens_in: 8200,
  tokens_out: 1300,
  cost_usd: 0.014,
};

let briefState: { data: PrBriefResponse | undefined; isLoading: boolean } = { data: { brief: null, stale: false }, isLoading: false };
const mutate = vi.fn();
let genState: { isPending: boolean; isError: boolean; isSuccess: boolean; error: Error | null } = {
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
};
let reviewsState: { data: ReviewRecord[] | undefined } = { data: [] };

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => briefState,
  useGenerateBrief: () => ({ ...genState, mutate }),
}));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: () => reviewsState }));
vi.mock("@/lib/hooks/core", () => ({
  usePullDetail: () => ({ data: { files: [{ path: "src/a.ts", additions: 1, deletions: 0 }] } }),
}));

import { PrBriefCard } from "./PrBriefCard";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  briefState = { data: { brief: null, stale: false }, isLoading: false };
  genState = { isPending: false, isError: false, isSuccess: false, error: null };
  reviewsState = { data: [] };
});

function renderCard(onOpenFile?: (p: string) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages, prReview: prReviewMessages }}>
      <PrBriefCard prId="pr1" onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
}

describe("SPEC-2026-09-30-pr-risk-brief", () => {
  it("AC-1: empty state shows the heading and an enabled Generate brief button that triggers one POST", () => {
    renderCard();
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Generate brief/ });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-3: while generating the button is disabled and shows a loading label", () => {
    genState.isPending = true;
    renderCard();
    expect(screen.getByRole("button", { name: /Generating/ })).toBeDisabled();
  });

  it("AC-4/AC-5/AC-19/AC-49: success renders summary as plain text, risks ordered with accessible severity names, focus heading with count", () => {
    briefState = { data: { brief: BRIEF, stale: false }, isLoading: false };
    renderCard();
    expect(screen.getByText("Adds rate limiting <b>to</b> the API.")).toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Review focus — read these first (2)")).toBeInTheDocument();
    const sev = screen.getAllByRole("img").map((i) => i.getAttribute("aria-label"));
    expect(sev).toEqual(["High severity", "Medium severity", "Low severity"]);
    expect(screen.getByText("src/b.ts:10-12")).toBeInTheDocument();
  });

  it("AC-6/AC-20: no risks shows the empty note; reload shows stored brief with no POST", () => {
    briefState = { data: { brief: { ...BRIEF, risks: { risks: [] } }, stale: false }, isLoading: false };
    renderCard();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("AC-16: missing inputs are listed in plain words, including issue entries", () => {
    briefState = {
      data: {
        brief: {
          ...BRIEF,
          missing_inputs: [
            ...BRIEF.missing_inputs,
            { input: "issue", status: "missing", reason: "unreachable", ref: "#12" },
          ],
        },
        stale: false,
      },
      isLoading: false,
    };
    renderCard();
    expect(screen.getByText(/Generated without: Intent \(not classified yet\), Linked issue #12/)).toBeInTheDocument();
  });

  it("AC-29/AC-32/AC-44: changed-file focus item is a button opening the file; blast-only item is plain text", () => {
    briefState = { data: { brief: BRIEF, stale: false }, isLoading: false };
    const open = vi.fn();
    renderCard(open);
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:12 — check the limiter" }));
    expect(open).toHaveBeenCalledWith("src/a.ts");
    expect(screen.queryByRole("button", { name: /src\/caller\.ts/ })).toBeNull();
    expect(screen.getByText(/src\/caller\.ts:4 — caller of limiter/)).toBeInTheDocument();
    expect(screen.getByText("not in this PR's diff")).toBeInTheDocument();
  });

  it("AC-33/AC-42/AC-45/AC-46: meta line, cost and tokens, Outdated badge and refresh tooltip", () => {
    briefState = { data: { brief: BRIEF, stale: true }, isLoading: false };
    renderCard();
    expect(screen.getByText(/Generated 3 hours ago · gpt-x/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.014 · 8\.2K→1\.3K/)).toBeInTheDocument();
    expect(screen.getByText("Outdated")).toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "Regenerate brief" });
    fireEvent.focus(refresh);
    expect(screen.getByRole("tooltip")).toHaveTextContent("new paid model call");
  });

  it("AC-42: no cost or tokens are shown when cost_usd is null", () => {
    briefState = { data: { brief: { ...BRIEF, cost_usd: null }, stale: false }, isLoading: false };
    renderCard();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("AC-37/NFR-7: a failed regeneration keeps the old brief, shows the error with Retry and announces it", () => {
    briefState = { data: { brief: BRIEF, stale: false }, isLoading: false };
    genState = { isPending: false, isError: true, isSuccess: false, error: new Error("boom") };
    renderCard();
    expect(screen.getByText("Adds rate limiting <b>to</b> the API.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Brief generation failed");
  });

  it("NFR-7: success is announced via a polite live region", () => {
    briefState = { data: { brief: BRIEF, stale: false }, isLoading: false };
    genState.isSuccess = true;
    renderCard();
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Brief ready");
  });

  it("AC-50/AC-51: latest review verdict banner renders above the summary; risk explanation expands", () => {
    briefState = { data: { brief: BRIEF, stale: false }, isLoading: false };
    reviewsState = {
      data: [
        {
          id: "r1", pr_id: "pr1", agent_id: null, run_id: null, agent_name: "Bot", kind: "review",
          verdict: "request_changes", summary: "Needs work", score: 40, model: null, created_at: "2026-09-30T00:00:00Z",
          findings: [],
        } as ReviewRecord,
      ],
    };
    renderCard();
    expect(screen.getByText("Needs work")).toBeInTheDocument();

    const toggles = screen.getAllByRole("button", { name: "Show why" });
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("high why")).toBeNull();
    fireEvent.click(toggles[0]!);
    expect(screen.getByText("high why")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-expanded", "true");
  });
});
