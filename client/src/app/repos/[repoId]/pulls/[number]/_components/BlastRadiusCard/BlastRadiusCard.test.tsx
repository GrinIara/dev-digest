import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../messages/en/blast.json";

const HAPPY: BlastRadiusResponse = {
  pr_id: "pr1",
  changed_symbols: [
    { name: "rateLimit", file: "src/lib/rate.ts", kind: "function" },
    { name: "CONFIG", file: "src/lib/config.ts", kind: "variable" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "publicRouter", file: "src/api/public/index.ts", line: 23 },
        { name: "webhookHandler", file: "src/api/webhooks.ts", line: 10 },
        { name: "resetJob", file: "src/jobs/reset.ts", line: 5 },
      ],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["job:reset-rate-buckets"],
    },
    {
      symbol: "CONFIG",
      callers: [
        { name: "adminRouter", file: "src/api/admin/index.ts", line: 8 },
        { name: "userRouter", file: "src/api/admin/users.ts", line: 2 },
      ],
      endpoints_affected: ["GET /api/admin/x", "POST /api/admin/y"],
      crons_affected: [],
    },
  ],
  summary: "2 changed symbol(s) reach 5 caller(s); 3 endpoint(s) and 1 cron(s) may be affected.",
  counts: { symbols: 2, callers: 5, endpoints: 3, crons: 1 },
  degraded: false,
  reason: null,
  indexed_sha: "abc123",
  indexed_branch: "main",
  callers_truncated: false,
  limits: { max_callers_per_symbol: 20, bfs_depth: 2 },
  // Fully covered by the index — no not-indexed hint in the happy-path fixture.
  files: { changed: 2, indexed: 2 },
  // One caller file per endpoint, so buildGraphLayout's caller→endpoint
  // edges (T9) are deterministic: publicRouter/adminRouter/userRouter each
  // declare one endpoint; webhookHandler/resetJob declare none (resetJob's
  // file is only linked to the cron, which the graph doesn't show).
  facts_by_file: {
    "src/api/public/index.ts": { endpoints: ["GET /api/public/items"], crons: [] },
    "src/api/webhooks.ts": { endpoints: [], crons: [] },
    "src/jobs/reset.ts": { endpoints: [], crons: ["job:reset-rate-buckets"] },
    "src/api/admin/index.ts": { endpoints: ["GET /api/admin/x"], crons: [] },
    "src/api/admin/users.ts": { endpoints: ["POST /api/admin/y"], crons: [] },
  },
};

const refetch = vi.fn();
let blastState: {
  data: BlastRadiusResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: typeof refetch;
} = { data: HAPPY, isLoading: false, isError: false, refetch };

vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: () => blastState,
}));

const resyncMutate = vi.fn();
vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false }),
  useRepoIntelStatus: () => ({
    data: { status: "full", filesIndexed: 1, filesSkipped: 0, lastIndexedSha: "abc123", updatedAt: "2026-09-27T00:00:00Z" },
  }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";
import { buildGraphLayout } from "./helpers";

afterEach(() => {
  cleanup();
  refetch.mockClear();
  resyncMutate.mockReset();
  blastState = { data: HAPPY, isLoading: false, isError: false, refetch };
});

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function renderCard() {
  return renderWithIntl(
    <BlastRadiusCard prId="pr1" repoId="repo1" repoFullName="acme/api" headSha="deadbeef" />,
  );
}

describe("BlastRadiusCard", () => {
  it("happy path: shows the title, the four stat counts, the symbol, exact GitHub links, and separate endpoint/cron chips (R6, R7)", () => {
    renderCard();

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("2 symbols")).toBeInTheDocument();
    expect(screen.getByText("5 callers")).toBeInTheDocument();
    expect(screen.getByText("3 endpoints")).toBeInTheDocument();
    expect(screen.getByText("1 cron/jobs")).toBeInTheDocument();
    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
    // CONFIG is a "variable", not a function/method — no trailing "()".
    expect(screen.getByText("CONFIG")).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: /Open src\/api\/public\/index\.ts line 23 on GitHub/,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/abc123/src/api/public/index.ts#L23",
    );
    expect(link).toHaveAttribute("target", "_blank");

    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByText("job:reset-rate-buckets")).toBeInTheDocument();
  });

  it("collapsible rows: the first symbol starts open, the second starts collapsed and expands on toggle (R11)", () => {
    renderCard();

    // rateLimit (first row) starts open — its caller link is visible.
    expect(
      screen.getByRole("link", { name: /Open src\/api\/public\/index\.ts line 23 on GitHub/ }),
    ).toBeInTheDocument();

    // CONFIG (second row) starts collapsed — its caller link is not rendered yet.
    expect(
      screen.queryByRole("link", { name: /Open src\/api\/admin\/index\.ts line 8 on GitHub/ }),
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Toggle callers of CONFIG" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: /Open src\/api\/admin\/index\.ts line 8 on GitHub/ }),
    ).toBeInTheDocument();
  });

  it("caller link click does not toggle the row's collapse state", () => {
    renderCard();

    const link = screen.getByRole("link", {
      name: /Open src\/api\/public\/index\.ts line 23 on GitHub/,
    });
    const toggle = screen.getByRole("button", { name: "Toggle callers of rateLimit" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(link);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("empty: shows the noDownstream text (with counts.symbols) and no links (R8)", () => {
    blastState = {
      data: { ...HAPPY, downstream: [], counts: { symbols: 2, callers: 0, endpoints: 0, crons: 0 } },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("not indexed (none): shows the branch/sha hint instead of noDownstream when no changed files are indexed yet (PR #218 bug fix)", () => {
    blastState = {
      data: {
        ...HAPPY,
        downstream: [],
        changed_symbols: [],
        counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
        indexed_sha: "0123456789abcdef",
        indexed_branch: "main",
        files: { changed: 48, indexed: 0 },
      },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    expect(
      screen.getByText(
        "None of this PR's changed files are in the repo index yet. The index is built from main (0123456), so files added or moved in this PR aren't known to it until they're merged.",
      ),
    ).toBeInTheDocument();
    // The hint replaces noDownstream, not supplements it.
    expect(screen.queryByText(/no downstream callers found/)).not.toBeInTheDocument();
  });

  it("not indexed (some): shows the partial-coverage hint alongside the existing data", () => {
    blastState = {
      data: { ...HAPPY, files: { changed: 5, indexed: 2 } },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    expect(
      screen.getByText("3 of 5 changed files aren't in the repo index (built from main (abc123)) — new or moved in this PR."),
    ).toBeInTheDocument();
    // Data is still shown alongside the hint.
    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
  });

  it("not indexed: falls back to the no-branch wording when indexed_branch/indexed_sha are unknown", () => {
    blastState = {
      data: {
        ...HAPPY,
        downstream: [],
        changed_symbols: [],
        counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
        indexed_sha: null,
        indexed_branch: null,
        files: { changed: 3, indexed: 0 },
      },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    expect(
      screen.getByText(
        "None of this PR's changed files are in the repo index yet — they're new or the index is older than the PR. Callers can't be resolved for them.",
      ),
    ).toBeInTheDocument();
  });

  it("not indexed hint is suppressed when the response is degraded (the degraded badge already explains it)", () => {
    blastState = {
      data: { ...HAPPY, degraded: true, reason: "index_partial", files: { changed: 5, indexed: 2 } },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    expect(screen.queryByText(/aren't in the repo index/)).not.toBeInTheDocument();
  });

  it("degraded: shows the badge with the reason label alongside the data (R4, R8)", () => {
    blastState = {
      data: { ...HAPPY, degraded: true, reason: "index_partial" },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    expect(screen.getByText(/Incomplete index · partial index/)).toBeInTheDocument();
    // Data is still shown alongside the degraded badge.
    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
  });

  it("resync: the button next to the degraded badge triggers the resync mutation once (R12)", () => {
    blastState = {
      data: { ...HAPPY, degraded: true, reason: "index_partial" },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(resyncMutate).toHaveBeenCalledTimes(1);
  });

  it("resync failure: a 409 from POST /repos/:id/resync (repo not cloned) stops the spinner and shows the error text (bug fix)", () => {
    blastState = {
      data: { ...HAPPY, degraded: true, reason: "index_partial" },
      isLoading: false,
      isError: false,
      refetch,
    };
    resyncMutate.mockImplementation((_vars: unknown, opts?: { onError?: (err: unknown) => void }) => {
      opts?.onError?.(
        new ApiError(
          "Repository isn't cloned yet — sync the repo first, then resync the index.",
          409,
          "repo_not_cloned",
        ),
      );
    });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Resync failed: Repository isn't cloned yet — sync the repo first, then resync the index.",
    );
    // The button goes back to "Resync" (not stuck on the loading spinner) so the user can retry.
    expect(screen.getByRole("button", { name: "Resync" })).toBeInTheDocument();
  });

  it("resync: the button is absent when the degraded reason is flag_off (resync can't fix a disabled flag)", () => {
    blastState = {
      data: { ...HAPPY, degraded: true, reason: "flag_off" },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    expect(screen.queryByRole("button", { name: "Resync" })).not.toBeInTheDocument();
  });

  it("error: shows the error title/body and retry calls refetch (R8)", () => {
    blastState = { data: undefined, isLoading: false, isError: true, refetch };
    renderCard();

    expect(screen.getByText("Couldn't load blast radius")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("buildGraphLayout: 2 symbol + 5 caller + 3 endpoint nodes, and 3 caller→endpoint edges (R13)", () => {
    const layout = buildGraphLayout(HAPPY, 640);

    expect(layout.nodes.filter((n) => n.column === 0)).toHaveLength(2);
    expect(layout.nodes.filter((n) => n.column === 1)).toHaveLength(5);
    expect(layout.nodes.filter((n) => n.column === 2)).toHaveLength(3);

    const callerToEndpointEdges = layout.edges.filter((e) => e.to.startsWith("endpoint:"));
    expect(callerToEndpointEdges).toHaveLength(3);
    const symbolToCallerEdges = layout.edges.filter((e) => e.from.startsWith("symbol:"));
    expect(symbolToCallerEdges).toHaveLength(5);
  });

  it("view toggle: switches to the Graph view and back to Tree (R13)", () => {
    renderCard();

    // Default is Tree.
    expect(screen.getByRole("button", { name: "tree" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "graph" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "graph" }));

    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open src\/api\/public\/index\.ts line 23 on GitHub/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("changed symbol")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("endpoints affected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));

    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open src\/api\/public\/index\.ts line 23 on GitHub/ }),
    ).toBeInTheDocument();
  });

  it("graph view: shows the empty-graph text when there is no downstream data (R13, R8)", () => {
    blastState = {
      data: { ...HAPPY, downstream: [], counts: { symbols: 2, callers: 0, endpoints: 0, crons: 0 } },
      isLoading: false,
      isError: false,
      refetch,
    };
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));

    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
  });
});

describe("SPEC-2026-09-29-project-context", () => {
  it("AC-58: a 409 local_edits lists the paths; Cancel sends nothing, Confirm re-posts with discard_local_edits", () => {
    blastState = {
      data: { ...HAPPY, degraded: true, reason: "index_partial" },
      isLoading: false,
      isError: false,
      refetch,
    };
    resyncMutate.mockImplementationOnce((_vars: unknown, opts?: { onError?: (err: unknown) => void }) => {
      opts?.onError?.(
        new ApiError("Local edits would be discarded", 409, "local_edits", { paths: ["specs/a.md"] }),
      );
    });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Discard local edits?")).toBeInTheDocument();
    expect(within(dialog).getByText("specs/a.md")).toBeInTheDocument();
    expect(resyncMutate).toHaveBeenCalledTimes(1);
    // A conflict is not a failure: no error alert, polling stopped.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(resyncMutate).toHaveBeenCalledTimes(1);

    resyncMutate.mockImplementationOnce((_vars: unknown, opts?: { onError?: (err: unknown) => void }) => {
      opts?.onError?.(
        new ApiError("Local edits would be discarded", 409, "local_edits", { paths: ["specs/a.md"] }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard and resync" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(resyncMutate).toHaveBeenCalledTimes(3);
    expect(resyncMutate.mock.calls[2]?.[0]).toEqual({ discardLocalEdits: true });
  });
});
