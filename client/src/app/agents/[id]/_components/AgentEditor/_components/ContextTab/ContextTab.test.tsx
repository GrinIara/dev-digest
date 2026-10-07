import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import ctxMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

const REPO_A = "11111111-1111-4111-8111-111111111111";
const REPO_B = "33333333-3333-4333-8333-333333333333";
let activeRepo: string | null = REPO_A;

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: activeRepo }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", name: "Sec" } as Agent;
const DOC_BASE = { used_by: 1, locally_modified: false };
const DOCS = {
  roots: ["specs/", "docs/", "insights/", "README.md"],
  total_tokens: 0,
  docs: [
    { ...DOC_BASE, path: "specs/a.md", name: "a.md", dir: "specs", type: "specs", tokens: 139 },
    { ...DOC_BASE, path: "docs/guide.md", name: "guide.md", dir: "docs", type: "docs", tokens: 50 },
  ],
};
const ctxFor = (repo: string, paths: string[] = []) => ({
  repo_id: repo,
  attached: paths.map((path) => {
    const d = DOCS.docs.find((x) => x.path === path)!;
    return { path, type: d.type, tokens: d.tokens, status: "present" };
  }),
  inherited: [],
  header_tokens: 10,
  total_tokens: 777,
});

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

let putStatus = 200;
let calls: { url: string; method: string; body?: string }[] = [];
let serverPaths: string[] = [];

beforeEach(() => {
  activeRepo = REPO_A;
  putStatus = 200;
  calls = [];
  serverPaths = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body as string | undefined });
      if (url.includes("/context/docs/content")) {
        return json({ ...DOCS.docs[0], content: "# Spec A\n\nbody" });
      }
      if (url.includes("/context/docs")) return json(DOCS);
      if (url.includes("/agents/ag1/context")) {
        const repo = new URL(url, "http://x").searchParams.get("repo_id")!;
        if (method === "PUT") {
          if (putStatus !== 200) return json({ error: { message: "boom" } }, putStatus);
          serverPaths = JSON.parse(init!.body as string).paths;
          return json(ctxFor(repo, serverPaths));
        }
        return json(ctxFor(repo, serverPaths));
      }
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ context: ctxMessages }}>
        <ToastProvider>
          <ContextTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SPEC-2026-09-29-project-context", () => {
  it("AC-13: checking a doc PUTs the full ordered path set", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: /specs\/a\.md/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(JSON.parse(put.body!)).toEqual({ paths: ["specs/a.md"] });
    expect(await screen.findByText("1 of 2 attached")).toBeInTheDocument();
  });

  it("AC-14: a failed PUT rolls the checkbox back and shows a toast", async () => {
    putStatus = 500;
    renderTab();
    const cb = await screen.findByRole("checkbox", { name: /specs\/a\.md/ });
    expect(cb).toHaveAttribute("aria-checked", "false");
    fireEvent.click(cb);
    expect(await screen.findByText("Couldn't update project context — try again")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /specs\/a\.md/ })).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("AC-19: the footer shows the server-computed total_tokens", async () => {
    renderTab();
    expect(await screen.findByText("≈ 777 tokens")).toBeInTheDocument();
  });

  it("AC-24/AC-25: Preview opens the drawer; its Attached toggle unchecks the row", async () => {
    serverPaths = ["specs/a.md"];
    renderTab();
    const cb = await screen.findByRole("checkbox", { name: /specs\/a\.md/ });
    expect(cb).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("specs/a.md")).toBeInTheDocument();
    expect(await within(dialog).findByText("≈ 139 tokens")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Attached" }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /specs\/a\.md/ })).toHaveAttribute("aria-checked", "false"),
    );
    expect(JSON.parse(calls.find((c) => c.method === "PUT")!.body!)).toEqual({ paths: [] });
  });

  it("AC-26: switching the active repo requests the other repo_id", async () => {
    const view = renderTab();
    await screen.findByRole("checkbox", { name: /specs\/a\.md/ });
    expect(calls.some((c) => c.url.includes(`repo_id=${REPO_A}`))).toBe(true);
    activeRepo = REPO_B;
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NextIntlClientProvider locale="en" messages={{ context: ctxMessages }}>
          <ToastProvider>
            <ContextTab agent={AGENT} />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(calls.some((c) => c.url.includes(`repo_id=${REPO_B}`))).toBe(true));
  });

  it("shows the select-repo hint when no repository is active", () => {
    activeRepo = null;
    renderTab();
    expect(screen.getByText(/Select a repository in the sidebar/)).toBeInTheDocument();
  });

  it("shows the not-cloned text on a 409 not_cloned response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      json({ error: { code: "not_cloned", message: "nope" } }, 409),
    );
    renderTab();
    expect(await screen.findByText(/hasn't been cloned yet/)).toBeInTheDocument();
  });
});
