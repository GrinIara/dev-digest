import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";

let brief: unknown = null;

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: { brief, stale: false }, isLoading: false }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null }),
}));
vi.mock("../PrBriefCard", () => ({ PrBriefCard: () => <div>brief-card</div> }));
vi.mock("../BlastRadiusCard", () => ({ BlastRadiusCard: () => <div>blast-card</div> }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrIntent: () => ({
    data: {
      intent: { summary: "S", in_scope: [], out_of_scope: [], risk_areas: ["auth flow"], confidence: "high", sources: [] },
      stale: false,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useReclassifyIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  brief = null;
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, intent: intentMessages }}>
      <OverviewTab prId="pr1" prBody="the body" repoId="r1" repoFullName="acme/api" headSha="abc" />
    </NextIntlClientProvider>,
  );
}

describe("SPEC-2026-09-30-pr-risk-brief", () => {
  it("AC-8/AC-9: Intent and Blast radius cards stay alongside the brief and description", () => {
    renderTab();
    expect(screen.getByText("brief-card")).toBeInTheDocument();
    expect(screen.getByText("blast-card")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("the body")).toBeInTheDocument();
  });

  it("AC-43: Intent risk_areas chips show without a brief and are hidden once a brief exists", () => {
    renderTab();
    expect(screen.getByText("auth flow")).toBeInTheDocument();
    cleanup();
    brief = { summary: "x" };
    renderTab();
    expect(screen.queryByText("auth flow")).toBeNull();
  });
});
