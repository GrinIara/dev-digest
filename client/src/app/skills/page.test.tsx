import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../messages/en/skills.json";

// AppShell pulls in the command palette / shell context, which need repo
// context providers this test doesn't set up — mock it to a passthrough,
// same approach as the former SkillsListView.test.tsx.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

const mockUseSkills = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => mockUseSkills(),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useSkillUsageCounts: () => new Map<string, number>(),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import SkillsPage from "./page";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillsPage (/skills)", () => {
  it("shows the skill list alongside the select-a-skill prompt when nothing is selected", () => {
    mockUseSkills.mockReturnValue({ data: [SKILL], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithIntl(<SkillsPage />);
    // list stays visible
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    // right pane shows the empty-selection prompt
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
    expect(screen.getByText("Pick a skill on the left to preview its body.")).toBeInTheDocument();
  });

  it("still shows the select prompt when the list is empty", () => {
    mockUseSkills.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithIntl(<SkillsPage />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });
});
