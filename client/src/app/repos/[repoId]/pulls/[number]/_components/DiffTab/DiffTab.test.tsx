import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const FILES: PrFile[] = [
  { path: "src/config.ts", additions: 2, deletions: 1, patch: null },
  { path: "src/config.test.ts", additions: 1, deletions: 0, patch: null },
];

const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [{ path: "src/config.ts", additions: 2, deletions: 1, finding_lines: [] }] },
    { role: "tests", files: [{ path: "src/config.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

let smartDiffState: { data: SmartDiff | undefined; isError: boolean } = { data: SMART, isError: false };

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: [] }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useSmartDiff: () => smartDiffState,
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  smartDiffState = { data: SMART, isError: false };
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — Smart/Original toggle (R6)", () => {
  it("renders Smart Diff group headers by default, and clicking Original order shows plain pr.files order without them", () => {
    renderWithIntl(<DiffTab prId="pr1" filesCount={2} files={FILES} />);

    // Smart mode: role group headers are visible.
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Tests")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Original order"));

    // Original mode: no role group headers, but the files still render.
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.queryByText("Tests")).not.toBeInTheDocument();
    const first = screen.getByText("src/config.ts");
    const second = screen.getByText("src/config.test.ts");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("falls back to the original order while useSmartDiff is errored", () => {
    smartDiffState = { data: undefined, isError: true };
    renderWithIntl(<DiffTab prId="pr1" filesCount={2} files={FILES} />);

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.queryByText("Tests")).not.toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("src/config.test.ts")).toBeInTheDocument();
  });
});
