import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockDelete = vi.fn((_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
vi.mock("@/lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: mockDelete, isPending: false }),
}));

import { SkillsSidebar } from "./SkillsSidebar";

afterEach(() => {
  cleanup();
  mockPush.mockReset();
  mockDelete.mockClear();
});

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Checks PR quality basics",
    type: "rubric",
    source: "manual",
    body: "# Rule\nBe kind.",
    enabled: true,
    version: 1,
  },
  {
    id: "sk2",
    name: "security-checklist",
    description: "Security review checks",
    type: "security",
    source: "manual",
    body: "# Rule\nCheck secrets.",
    enabled: true,
    version: 2,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsSidebar", () => {
  it("renders skeletons while loading", () => {
    renderWithIntl(<SkillsSidebar skills={undefined} activeId={undefined} isLoading onToggleSkill={vi.fn()} />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
  });

  it("renders an error state with retry when the list fails to load", () => {
    const onRetry = vi.fn();
    renderWithIntl(
      <SkillsSidebar skills={undefined} activeId={undefined} isError onRetry={onRetry} onToggleSkill={vi.fn()} />,
    );
    expect(screen.getByText("Could not load skills.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders the empty state when there are no skills", () => {
    renderWithIntl(<SkillsSidebar skills={[]} activeId={undefined} onToggleSkill={vi.fn()} />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });

  it("renders a card per skill, all pointing at ?tab=config", () => {
    renderWithIntl(<SkillsSidebar skills={SKILLS} activeId={undefined} onToggleSkill={vi.fn()} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("security-checklist")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/skills/sk1?tab=config",
      "/skills/sk2?tab=config",
    ]);
  });

  it("forwards onToggleSkill with the skill id", () => {
    const onToggleSkill = vi.fn();
    renderWithIntl(<SkillsSidebar skills={SKILLS} activeId={undefined} onToggleSkill={onToggleSkill} />);
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(onToggleSkill).toHaveBeenCalledWith("sk1", false);
  });

  it("filters the list via the search input", () => {
    renderWithIntl(<SkillsSidebar skills={SKILLS} activeId={undefined} onToggleSkill={vi.fn()} />);
    const input = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(input, { target: { value: "security" } });
    expect(screen.getByText("security-checklist")).toBeInTheDocument();
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
  });

  it("navigates back to /skills when the active skill is deleted", () => {
    renderWithIntl(<SkillsSidebar skills={SKILLS} activeId="sk1" onToggleSkill={vi.fn()} />);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete skill" });
    fireEvent.click(deleteButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockDelete).toHaveBeenCalledWith("sk1", expect.anything());
    expect(mockPush).toHaveBeenCalledWith("/skills");
  });

  it("does not navigate when a non-active skill is deleted", () => {
    renderWithIntl(<SkillsSidebar skills={SKILLS} activeId="sk1" onToggleSkill={vi.fn()} />);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete skill" });
    fireEvent.click(deleteButtons[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockDelete).toHaveBeenCalledWith("sk2", expect.anything());
    expect(mockPush).not.toHaveBeenCalled();
  });
});
