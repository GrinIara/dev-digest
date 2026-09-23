import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const mockDelete = vi.fn();
const mockUseDeleteSkill = vi.fn(() => ({ mutate: mockDelete, isPending: false }));
vi.mock("@/lib/hooks/skills", () => ({
  useDeleteSkill: () => mockUseDeleteSkill(),
}));

import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  mockDelete.mockReset();
  mockUseDeleteSkill.mockReturnValue({ mutate: mockDelete, isPending: false });
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality basics",
  type: "rubric",
  source: "manual",
  body: "# Rule\nBe kind.",
  enabled: true,
  version: 3,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, type badge and source badge", () => {
    renderWithIntl(<SkillCard skill={SKILL} usedByCount={2} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("renders the version badge", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("fires onToggle when the enabled switch is clicked", () => {
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("renders as a real, keyboard-reachable link when href is given", () => {
    renderWithIntl(<SkillCard skill={SKILL} href="/skills/sk1?tab=config" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/skills/sk1?tab=config");
  });

  it("renders active styling when active is true (no crash, card still renders)", () => {
    renderWithIntl(<SkillCard skill={SKILL} active />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
  });

  describe("delete flow", () => {
    it("opens a confirmation modal instead of deleting immediately", () => {
      renderWithIntl(<SkillCard skill={SKILL} />);
      fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("does not delete when the modal is cancelled", () => {
      renderWithIntl(<SkillCard skill={SKILL} />);
      fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(mockDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("calls the delete mutation and onDeleted when confirmed", () => {
      mockDelete.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
      const onDeleted = vi.fn();
      renderWithIntl(<SkillCard skill={SKILL} onDeleted={onDeleted} />);
      fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(mockDelete).toHaveBeenCalledWith("sk1", expect.anything());
      expect(onDeleted).toHaveBeenCalled();
    });
  });
});
