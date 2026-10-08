import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import ctxMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

const REPO = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: REPO }),
}));

import { ContextTab } from "./ContextTab";

const SKILL = { id: "sk1", name: "Rubric" } as Skill;
const DOC_BASE = { used_by: 0, locally_modified: false };
const DOCS = {
  roots: ["specs/", "docs/", "insights/", "README.md"],
  total_tokens: 0,
  docs: [
    { ...DOC_BASE, path: "specs/a.md", name: "a.md", dir: "specs", type: "specs", tokens: 10 },
    { ...DOC_BASE, path: "docs/guide.md", name: "guide.md", dir: "docs", type: "docs", tokens: 20 },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

let serverPaths: string[] = [];
const ctxBody = () => ({
  repo_id: REPO,
  attached: serverPaths.map((path) => {
    const d = DOCS.docs.find((x) => x.path === path)!;
    return { path, type: d.type, tokens: d.tokens, status: "present" };
  }),
  header_tokens: 5,
  total_tokens: 99,
});

beforeEach(() => {
  serverPaths = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/context/docs")) return json(DOCS);
      if (url.includes("/skills/sk1/context")) {
        if (init?.method === "PUT") serverPaths = JSON.parse(init.body as string).paths;
        return json(ctxBody());
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
          <ContextTab skill={SKILL} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SPEC-2026-09-29-project-context", () => {
  it("AC-29: shows heading, subtitle and an attached count after checking a doc", async () => {
    renderTab();
    expect(await screen.findByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("0 attached")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /specs\/a\.md/ }));
    expect(await screen.findByText("1 attached")).toBeInTheDocument();
  });

  it("AC-30: serialization preview has one heading per group with its path", async () => {
    serverPaths = ["specs/a.md", "docs/guide.md"];
    renderTab();
    const specs = await screen.findByRole("heading", { name: "Project specifications" });
    const docs = screen.getByRole("heading", { name: "Project docs" });
    expect(specs.nextElementSibling).toHaveTextContent("specs/a.md");
    expect(docs.nextElementSibling).toHaveTextContent("docs/guide.md");
    expect(screen.queryByRole("heading", { name: "Project insights" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("≈ 99 tokens")).toBeInTheDocument());
  });
});
