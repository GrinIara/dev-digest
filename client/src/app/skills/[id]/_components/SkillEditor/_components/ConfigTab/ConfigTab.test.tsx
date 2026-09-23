import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const mockMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: mockMutate, isPending: false, isSuccess: false, data: undefined }),
  useSkillTokenCount: () => ({ data: { tokens: 42 }, refetch: vi.fn() }),
}));

import { ConfigTab } from "./ConfigTab";

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
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab (smoke)", () => {
  it("renders the skill's current field values and token count", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("42 tokens")).toBeInTheDocument();
  });

  it("saves with the edited fields on Save", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("pr-quality-rubric"), { target: { value: "renamed-rubric" } });
    fireEvent.click(screen.getByText("Save"));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sk1",
        patch: expect.objectContaining({ name: "renamed-rubric", type: "rubric", enabled: true }),
      }),
      expect.anything(),
    );
  });
});
