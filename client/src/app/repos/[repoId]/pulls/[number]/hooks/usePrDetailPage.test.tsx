import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const replace = vi.fn();
let query = "tab=overview";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ replace }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("../../../../../../lib/hooks", () => ({
  usePullDetail: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  usePulls: () => ({ data: [], isLoading: false }),
}));
vi.mock("../../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({}),
}));
vi.mock("../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: null }),
  useRepoNotFound: () => false,
}));

import { usePrDetailPage } from "./usePrDetailPage";

beforeEach(() => {
  replace.mockClear();
  query = "tab=overview&trace=run1";
});

describe("SPEC-2026-09-30-pr-risk-brief", () => {
  it("AC-30: openFileInDiff sets tab and file in a single URL update, keeping other params", () => {
    const { result } = renderHook(() => usePrDetailPage());
    result.current.openFileInDiff("src/a b.ts");

    expect(replace).toHaveBeenCalledTimes(1);
    const url = new URL(replace.mock.calls[0]![0] as string, "http://x");
    expect(url.pathname).toBe("/repos/r1/pulls/7");
    expect(url.searchParams.get("tab")).toBe("diff");
    expect(url.searchParams.get("file")).toBe("src/a b.ts");
    expect(url.searchParams.get("trace")).toBe("run1");
  });

  it("setTab drops a stale file param when leaving the diff tab, and exposes focusFile", () => {
    query = "tab=diff&file=src/a.ts";
    const { result } = renderHook(() => usePrDetailPage());
    expect(result.current.focusFile).toBe("src/a.ts");

    result.current.setTab("overview");
    const url = new URL(replace.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("tab")).toBe("overview");
    expect(url.searchParams.has("file")).toBe(false);
  });
});
