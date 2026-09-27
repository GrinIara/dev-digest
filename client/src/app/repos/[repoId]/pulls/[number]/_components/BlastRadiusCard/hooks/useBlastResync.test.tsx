import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { RESYNC_POLL_MAX_MS } from "../constants";

interface FakeStatus {
  status: "full" | "partial" | "degraded" | "failed";
  updatedAt: string;
  lastIndexedSha: string;
}

type MutateOptions = { onError?: (err: unknown) => void };

let statusData: FakeStatus | undefined;
const resyncMutate = vi.fn<(vars: unknown, opts?: MutateOptions) => void>();

vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false }),
  useRepoIntelStatus: () => ({ data: statusData }),
}));

import { useBlastResync } from "./useBlastResync";

function renderWithClient(prId: string) {
  const qc = new QueryClient();
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useBlastResync("repo1", prId), { wrapper });
  return { ...view, invalidateSpy };
}

describe("useBlastResync", () => {
  beforeEach(() => {
    statusData = undefined;
    resyncMutate.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("baseline present at click: an advanced status invalidates the pr-blast query and stops polling", () => {
    statusData = { status: "full", updatedAt: "t0", lastIndexedSha: "sha0" };
    const { result, rerender, invalidateSpy } = renderWithClient("pr1");

    act(() => result.current.start());
    expect(resyncMutate).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(true);
    expect(invalidateSpy).not.toHaveBeenCalled();

    statusData = { status: "full", updatedAt: "t1", lastIndexedSha: "sha0" };
    rerender();

    expect(result.current.running).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pr-blast", "pr1"] });
  });

  it("baseline missing at click: the first status observed while polling becomes the baseline, then an advanced status stops polling", () => {
    statusData = undefined;
    const { result, rerender, invalidateSpy } = renderWithClient("pr1");

    act(() => result.current.start());
    expect(result.current.running).toBe(true);

    // First status arrives after polling started — becomes the baseline, not
    // an "advanced" signal on its own.
    statusData = { status: "full", updatedAt: "t0", lastIndexedSha: "sha0" };
    rerender();
    expect(result.current.running).toBe(true);
    expect(invalidateSpy).not.toHaveBeenCalled();

    // A genuinely later status now stops the poll.
    statusData = { status: "full", updatedAt: "t1", lastIndexedSha: "sha0" };
    rerender();
    expect(result.current.running).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pr-blast", "pr1"] });
  });

  it("no progress: stops at RESYNC_POLL_MAX_MS regardless of baseline availability, and exposes noChange rather than silently invalidating", () => {
    vi.useFakeTimers();
    statusData = { status: "full", updatedAt: "t0", lastIndexedSha: "sha0" };
    const { result, invalidateSpy } = renderWithClient("pr1");

    act(() => result.current.start());
    expect(result.current.running).toBe(true);

    act(() => {
      vi.advanceTimersByTime(RESYNC_POLL_MAX_MS);
    });

    expect(result.current.running).toBe(false);
    expect(result.current.noChange).toBe(true);
    expect(result.current.error).toBeNull();
    // Nothing changed server-side — refetching the same blast data would be
    // wasted work, so the timeout path does NOT invalidate the query (unlike
    // the "advanced" path above).
    expect(invalidateSpy).not.toHaveBeenCalled();

    // A fresh click clears the stale noChange flag.
    act(() => result.current.start());
    expect(result.current.noChange).toBe(false);
  });

  it("mutate error (e.g. the 409 the server now returns for an un-cloned repo): stops polling immediately and exposes the message, without invalidating the blast query", () => {
    statusData = { status: "full", updatedAt: "t0", lastIndexedSha: "sha0" };
    resyncMutate.mockImplementation((_vars, opts) => {
      opts?.onError?.(
        new ApiError(
          "Repository isn't cloned yet — sync the repo first, then resync the index.",
          409,
          "repo_not_cloned",
        ),
      );
    });
    const { result, invalidateSpy } = renderWithClient("pr1");

    act(() => result.current.start());

    expect(result.current.running).toBe(false);
    expect(result.current.error).toBe(
      "Repository isn't cloned yet — sync the repo first, then resync the index.",
    );
    expect(result.current.noChange).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
