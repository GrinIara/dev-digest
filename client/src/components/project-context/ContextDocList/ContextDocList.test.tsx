import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/context.json";
import type { ContextAttachedRow, ContextDoc, ContextInheritedRow } from "@/lib/types";
import { ContextDocList } from "./ContextDocList";

afterEach(cleanup);

const doc = (path: string, type: ContextDoc["type"], tokens: number): ContextDoc => {
  const i = path.lastIndexOf("/");
  return {
    path,
    name: path.slice(i + 1),
    dir: i < 0 ? "" : path.slice(0, i),
    type,
    tokens,
    used_by: 0,
    locally_modified: false,
  };
};
const DOCS = [
  doc("specs/a.md", "specs", 100),
  doc("specs/public-api.md", "specs", 200),
  doc("docs/guide.md", "docs", 50),
];
const present = (path: string, type: ContextAttachedRow["type"], tokens: number): ContextAttachedRow => ({
  path,
  type,
  tokens,
  status: "present",
});

function renderList(props: Partial<React.ComponentProps<typeof ContextDocList>> = {}) {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocList
        docs={DOCS}
        attached={[]}
        onChange={onChange}
        onPreview={onPreview}
        pending={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onChange, onPreview };
}

describe("SPEC-2026-09-29-project-context", () => {
  it("AC-12: rows show path, folder, type badge and tokens", () => {
    renderList({ attached: [present("specs/a.md", "specs", 100)] });
    const cb = screen.getByRole("checkbox", { name: /specs\/a\.md/ });
    expect(cb).toHaveAttribute("aria-checked", "true");
    expect(cb).toHaveAccessibleName(/specs.*≈ 100 tokens/);
    const guide = screen.getByRole("checkbox", { name: /docs\/guide\.md/ });
    expect(guide).toHaveAttribute("aria-checked", "false");
    expect(guide).toHaveAccessibleName(/docs.*≈ 50 tokens/);
  });

  it("AC-12: attached rows come first, then unattached docs", () => {
    renderList({ attached: [present("docs/guide.md", "docs", 50)] });
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toHaveAccessibleName(/docs\/guide\.md/);
  });

  it("AC-13: checking an unattached row appends its path", () => {
    const { onChange } = renderList({ attached: [present("specs/a.md", "specs", 100)] });
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/guide\.md/ }));
    expect(onChange).toHaveBeenCalledWith(["specs/a.md", "docs/guide.md"]);
  });

  it("AC-16: Move up on the second attached row swaps the order", () => {
    const { onChange } = renderList({
      attached: [present("specs/a.md", "specs", 100), present("docs/guide.md", "docs", 50)],
    });
    const ups = screen.getAllByRole("button", { name: "Move up" });
    expect(ups[0]).toBeDisabled();
    fireEvent.click(ups[1]!);
    expect(onChange).toHaveBeenCalledWith(["docs/guide.md", "specs/a.md"]);
    const downs = screen.getAllByRole("button", { name: "Move down" });
    expect(downs[1]).toBeDisabled();
  });

  it("AC-16: dragging an attached row onto another reorders", () => {
    const { onChange } = renderList({
      attached: [present("specs/a.md", "specs", 100), present("docs/guide.md", "docs", 50)],
    });
    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[0]!);
    fireEvent.drop(rows[1]!);
    expect(onChange).toHaveBeenCalledWith(["docs/guide.md", "specs/a.md"]);
  });

  it("AC-17: filter narrows rows case-insensitively; AC-18: shows the empty message", () => {
    renderList();
    const filter = screen.getByRole("textbox", { name: /filter/i });
    fireEvent.change(filter, { target: { value: "API" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /public-api\.md/ })).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "nothing-here" } });
    expect(screen.getByText("No documents match")).toBeInTheDocument();
  });

  it("AC-21: inherited rows are read-only and name the skill", () => {
    const inherited: ContextInheritedRow[] = [
      { ...present("docs/guide.md", "docs", 50), skill_id: "22222222-2222-4222-8222-222222222222", skill_name: "S" },
    ];
    renderList({ inherited });
    expect(screen.getByText("via skill S")).toBeInTheDocument();
    const row = screen.getAllByRole("listitem").find((li) => within(li).queryByText("via skill S"))!;
    expect(within(row).getByRole("checkbox")).toBeDisabled();
  });

  it("AC-22: a missing attached row offers Detach, which drops the path", () => {
    const { onChange } = renderList({
      attached: [
        present("specs/a.md", "specs", 100),
        { path: "specs/gone.md", type: null, tokens: null, status: "missing" },
      ],
    });
    expect(screen.getByText("Missing in repo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    expect(onChange).toHaveBeenCalledWith(["specs/a.md"]);
  });

  it("Preview button reports the row path", () => {
    const { onPreview } = renderList({ docs: [DOCS[2]!] });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreview).toHaveBeenCalledWith("docs/guide.md");
  });
});
