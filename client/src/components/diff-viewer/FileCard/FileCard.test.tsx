import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { LineAnnotationMap } from "../annotations";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/config.ts",
  additions: 2,
  deletions: 1,
  patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FileCard — generic annotation extension points (R5)", () => {
  it("renders an annotation's content directly after the diff line it's anchored to", () => {
    const annotations: LineAnnotationMap = new Map([
      ["RIGHT:2", [{ id: "a1", color: "red", label: "blocker", content: <span>Annotation content</span> }]],
    ]);
    renderWithIntl(<FileCard file={FILE} annotations={annotations} />);

    const lineText = screen.getByText("const b = 3;");
    const content = screen.getByText("Annotation content");
    const position = lineText.compareDocumentPosition(content);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the marked dot when marked is true, and hides it otherwise", () => {
    renderWithIntl(<FileCard file={FILE} marked />);
    expect(screen.getByLabelText("Flagged")).toBeInTheDocument();

    cleanup();
    renderWithIntl(<FileCard file={FILE} />);
    expect(screen.queryByLabelText("Flagged")).not.toBeInTheDocument();
  });

  it("lists an annotation whose line isn't rendered in this patch under the unanchored footer", () => {
    const annotations: LineAnnotationMap = new Map([
      ["RIGHT:99", [{ id: "a2", color: "red", label: "blocker", content: <span>Orphan note</span> }]],
    ]);
    renderWithIntl(<FileCard file={FILE} annotations={annotations} />);

    expect(screen.getByText("1 note(s) not on a line shown in this diff")).toBeInTheDocument();
    expect(screen.getByText("Orphan note")).toBeInTheDocument();
  });
});
