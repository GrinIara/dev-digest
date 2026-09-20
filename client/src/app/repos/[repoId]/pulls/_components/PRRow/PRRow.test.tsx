/**
 * PRRow — the list's Cost column shows a compact USD figure, or "—" (never
 * "$0.00") when the PR has no run with known cost yet.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-11T18:00:00.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: null,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={row} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows a compact cost figure when known", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—', never '$0.00', when cost is unknown", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("PRRow — findings column", () => {
  it("shows a severity badge with count per non-zero severity", () => {
    renderRow(pr({ findings: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 } }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows '—' when the PR has never been reviewed", () => {
    renderRow(pr({ findings: null }));
    // score, findings, and cost cells all fall back to "—" when unreviewed
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("reveals a read-only findings preview on hover, with no action buttons", async () => {
    renderRow(
      pr({
        findings: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
        latest_findings: [
          {
            id: "f1",
            severity: "CRITICAL",
            category: "security",
            title: "Hardcoded Stripe secret key",
            file: "src/config.ts",
            start_line: 12,
            end_line: 12,
            rationale: "A live key is committed.",
            suggestion: null,
            confidence: 0.98,
            kind: "finding",
            trifecta_components: null,
            evidence: null,
            review_id: "r1",
            accepted_at: null,
            dismissed_at: null,
          },
        ],
      }),
    );
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
    fireEvent.mouseOver(screen.getAllByText("1")[0]!);
    expect(await screen.findByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept|dismiss/i })).not.toBeInTheDocument();
  });
});
