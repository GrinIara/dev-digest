import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

// AppShell pulls in the command palette / shell context, which need repo
// context providers this test doesn't set up — mock it to a passthrough,
// same approach as mocking data hooks below.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseSkills = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => mockUseSkills(),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useSkillUsageCounts: () => new Map<string, number>(),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality basics",
  type: "rubric",
  source: "manual",
  body: "# Rule\nBe kind.",
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillsListView", () => {
  it("renders skeletons while loading", () => {
    mockUseSkills.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
  });

  it("renders the empty state when there are no skills", () => {
    mockUseSkills.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });

  it("renders a card per skill when loaded", () => {
    mockUseSkills.mockReturnValue({ data: [SKILL], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
  });

  it("renders an error state with retry when the list fails to load", () => {
    mockUseSkills.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Could not load skills.")).toBeInTheDocument();
  });
});
