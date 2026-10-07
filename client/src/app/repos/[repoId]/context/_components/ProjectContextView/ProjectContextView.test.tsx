import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/context.json";
import { NAV } from "@devdigest/ui/nav";
import { ProjectContextView } from "./ProjectContextView";

const REPO = "11111111-1111-4111-8111-111111111111";

const DOC_BASE = { dir: "specs", type: "specs", tokens: 120, used_by: 2, locally_modified: false };
const LIST = {
  roots: ["specs/", "docs/", "insights/", "README.md"],
  total_tokens: 340,
  docs: [
    { ...DOC_BASE, path: "specs/public-api.md", name: "public-api.md" },
    { ...DOC_BASE, path: "README.md", name: "README.md", dir: "", type: "docs", tokens: 220, used_by: 0 },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

let listResponse: () => Promise<Response>;
let contentBody = "# Public API\n\nHello";
let modifiedPaths: string[] = [];
let putResponse: () => Promise<Response>;

beforeEach(() => {
  listResponse = () => json(LIST);
  modifiedPaths = [];
  putResponse = () => json({ ...LIST.docs[0], content: "saved" });
  contentBody = "# Public API\n\nHello";
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/context/docs/content") && init?.method === "PUT") return putResponse();
      if (url.includes("/context/docs/content")) {
        const path = decodeURIComponent(url.split("path=")[1] ?? "");
        const meta = LIST.docs.find((d) => d.path === path) ?? LIST.docs[0]!;
        return json({ ...meta, locally_modified: modifiedPaths.includes(meta.path), content: contentBody });
      }
      if (url.includes("/context/docs")) return listResponse();
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ProjectContextView repoId={REPO} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SPEC-2026-09-29-project-context", () => {
  it("AC-3: selecting a doc renders its Markdown in Preview with a breadcrumb", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "specs/public-api.md" }));
    expect(await screen.findByRole("heading", { name: "Public API" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
    const crumb = screen.getByRole("navigation", { name: "breadcrumb" });
    const parts = crumb.querySelectorAll("span");
    expect(parts[parts.length - 1]).toHaveTextContent("public-api.md");
  });

  it("AC-4: shows how many agents use the doc", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "specs/public-api.md" }));
    expect(await screen.findByText("Used by 2 agents")).toBeInTheDocument();
  });

  it("AC-6: Refresh refetches and shows a newly returned file", async () => {
    renderView();
    await screen.findByRole("button", { name: "specs/public-api.md" });
    listResponse = () =>
      json({
        ...LIST,
        docs: [...LIST.docs, { ...DOC_BASE, path: "specs/new.md", name: "new.md" }],
      });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("button", { name: "specs/new.md" })).toBeInTheDocument();
  });

  it("AC-7: a 409 not_cloned shows the not-cloned text", async () => {
    listResponse = () => json({ error: { code: "not_cloned", message: "no clone" } }, 409);
    renderView();
    expect(
      await screen.findByText(
        "This repository hasn't been cloned yet — documents appear after the first sync.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-8: an empty list names every root", async () => {
    listResponse = () => json({ ...LIST, docs: [], total_tokens: 0 });
    renderView();
    const text = await screen.findByText(/No documents found under/);
    for (const root of ["specs/", "docs/", "insights/", "README.md"]) {
      expect(text.textContent).toContain(root);
    }
  });

  it("AC-10: raw HTML in a document is not rendered", async () => {
    contentBody = "# T\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>";
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "specs/public-api.md" }));
    const region = await screen.findByRole("region", { name: "specs/public-api.md" });
    await waitFor(() => expect(within(region).getByRole("heading")).toBeInTheDocument());
    expect(region.querySelector("script")).toBeNull();
    expect(within(region).queryByRole("img")).toBeNull();
    expect(region.querySelector("img")).toBeNull();
  });

  it("AC-63: has no new-file, folder, upload, delete or commit controls", async () => {
    renderView();
    await screen.findByRole("button", { name: "specs/public-api.md" });
    expect(screen.queryByRole("button", { name: /new file|new folder|upload|delete|commit/i })).toBeNull();
  });

  it("AC-64: shows the file count and total tokens footer", async () => {
    renderView();
    expect(await screen.findByText("2 files · ≈340 tokens total")).toBeInTheDocument();
  });

  it("renders a README.md doc in the tree and shows its docs badge in the header", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
    await screen.findByRole("region", { name: "README.md" });
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("opens the first document in tree order without a click", async () => {
    renderView();
    expect(await screen.findByRole("region", { name: "specs/public-api.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "specs/public-api.md" })).toHaveAttribute("aria-current", "true");
  });

  it("registers the Project Context nav entry after Pull Requests", () => {
    const items = NAV.find((g) => g.section === "WORKSPACE")?.items ?? [];
    expect(items.map((i) => i.key)).toEqual(["pulls", "context"]);
  });
  it("AC-52: Edit shows the raw Markdown in a labelled textbox and a Save button", async () => {
    contentBody = "# Public API — PRD\n\nBody";
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "specs/public-api.md" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Raw Markdown for specs/public-api.md");
    expect((box as HTMLTextAreaElement).value).toBe("# Public API — PRD\n\nBody");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("AC-57: the local-edit label shows on the tree row and in the header", async () => {
    modifiedPaths = ["specs/public-api.md"];
    listResponse = () =>
      json({ ...LIST, docs: [{ ...LIST.docs[0], locally_modified: true }, LIST.docs[1]] });
    renderView();
    const row = await screen.findByRole("button", { name: "specs/public-api.md" });
    const label = "Local edit — not committed to GitHub";
    expect(within(row).getByText(label)).toBeInTheDocument();
    fireEvent.click(row);
    await screen.findByRole("heading", { name: "Public API" });
    expect(screen.getAllByText(label)).toHaveLength(2);
  });

  it("AC-61: leaving Edit with unsaved text asks to discard; Cancel keeps the text", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "specs/public-api.md" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Raw Markdown for specs/public-api.md");
    fireEvent.change(box, { target: { value: "changed text" } });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Discard unsaved changes?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Raw Markdown for specs/public-api.md") as HTMLTextAreaElement).value).toBe(
      "changed text",
    );

    // Selecting another doc is guarded too; Discard proceeds.
    fireEvent.click(screen.getByRole("button", { name: "README.md" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }));
    expect(screen.queryByLabelText("Raw Markdown for specs/public-api.md")).toBeNull();
    expect(await screen.findByRole("region", { name: "README.md" })).toBeInTheDocument();
  });

  it("AC-62: a failed save keeps the text and shows an error", async () => {
    putResponse = () => json({ error: { code: "internal", message: "boom" } }, 500);
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "specs/public-api.md" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Raw Markdown for specs/public-api.md") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "unsaved work" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save — your changes are still in the editor",
    );
    expect(box.value).toBe("unsaved work");
  });
});
