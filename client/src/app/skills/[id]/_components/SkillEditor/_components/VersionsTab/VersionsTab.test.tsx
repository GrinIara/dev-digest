import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { diffBodies } from "./helpers";

const mockUseSkillVersions = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => mockUseSkillVersions(),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality basics",
  type: "rubric",
  source: "manual",
  body: "line one\nline two\nline three",
  enabled: true,
  version: 2,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 2, body: "line one\nline two\nline three", change_summary: "Added line three", created_at: "2026-09-20T00:00:00Z" },
  { skill_id: "sk1", version: 1, body: "line one\nline two", change_summary: null, created_at: "2026-09-19T00:00:00Z" },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab (smoke)", () => {
  it("renders newest-first, current version has no diff/restore, older ones do", () => {
    mockUseSkillVersions.mockReturnValue({ data: VERSIONS, isLoading: false });
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Added line three")).toBeInTheDocument();
    expect(screen.getByText("No summary")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getAllByText("Diff")).toHaveLength(1);
    expect(screen.getAllByText("Restore")).toHaveLength(1);
  });

  it("opens the diff modal showing the removed/added lines", () => {
    mockUseSkillVersions.mockReturnValue({ data: VERSIONS, isLoading: false });
    renderWithIntl(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("Diff"));
    expect(screen.getByText(/\+ line three/)).toBeInTheDocument();
  });
});

describe("diffBodies", () => {
  it("marks added lines as add and unchanged lines as same", () => {
    const lines = diffBodies("line one\nline two", "line one\nline two\nline three");
    expect(lines).toEqual([
      { type: "same", value: "line one" },
      { type: "same", value: "line two" },
      { type: "add", value: "line three" },
    ]);
  });
});
