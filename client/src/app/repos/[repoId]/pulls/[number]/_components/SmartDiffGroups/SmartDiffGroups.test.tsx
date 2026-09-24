import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import type { ResolvedGroup } from "../DiffTab/helpers";
import messages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import { SmartDiffGroups } from "./SmartDiffGroups";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function prFile(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: null };
}

const GROUPS: ResolvedGroup[] = [
  {
    role: "core",
    files: [prFile("src/config.ts"), prFile("src/service.ts")],
    withFindings: 2,
  },
  {
    role: "tests",
    files: [prFile("src/config.test.ts")],
    withFindings: 0,
  },
  {
    role: "docs",
    files: [prFile("docs/readme.md")],
    withFindings: 0,
  },
  {
    role: "boilerplate",
    files: [prFile("pnpm-lock.yaml")],
    withFindings: 0,
  },
];

const noFileProps = () => ({});

describe("SmartDiffGroups (R6)", () => {
  it("shows headers in role order with labels and file counts, an expanded core/tests and collapsed docs/boilerplate, and a hidden ● at 0", () => {
    renderWithIntl(<SmartDiffGroups groups={GROUPS} fileProps={noFileProps} />);

    const headers = screen.getAllByRole("button");
    expect(headers.map((h) => within(h).getByText(/^(Core|Tests|Docs|Boilerplate)$/).textContent)).toEqual([
      "Core",
      "Tests",
      "Docs",
      "Boilerplate",
    ]);

    // core: expanded by default, files visible, ● 2 shown
    expect(headers[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(within(headers[0]!).getByText("● 2")).toBeInTheDocument();
    expect(within(headers[0]!).getByText("2 files")).toBeInTheDocument();

    // tests: expanded, no ● (0 findings)
    expect(headers[1]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/config.test.ts")).toBeInTheDocument();
    expect(within(headers[1]!).queryByText(/^●/)).not.toBeInTheDocument();

    // docs/boilerplate start collapsed — file paths not visible
    expect(headers[2]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("docs/readme.md")).not.toBeInTheDocument();
    expect(headers[3]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
  });

  it("reveals a collapsed group's files when its header is clicked", () => {
    renderWithIntl(<SmartDiffGroups groups={GROUPS} fileProps={noFileProps} />);
    const docsHeader = screen.getAllByRole("button")[2]!;

    expect(screen.queryByText("docs/readme.md")).not.toBeInTheDocument();
    fireEvent.click(docsHeader);
    expect(screen.getByText("docs/readme.md")).toBeInTheDocument();
    expect(docsHeader).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(docsHeader);
    expect(screen.queryByText("docs/readme.md")).not.toBeInTheDocument();
    expect(docsHeader).toHaveAttribute("aria-expanded", "false");
  });
});
