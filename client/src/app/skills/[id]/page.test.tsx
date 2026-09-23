import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../messages/en/skills.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "sk1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// The detail pane's own fetch/tab/rendering is covered by SkillEditor's and
// its tabs' own tests — stub it here so this test can focus on what page.tsx
// is actually responsible for: the sidebar list staying visible next to
// whatever detail content is passed in.
vi.mock("./_components/SkillDetailContent", () => ({
  SkillDetailContent: ({ id }: { id: string }) => <div data-testid="detail-stub">Detail for {id}</div>,
}));

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

const mockUseSkills = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => mockUseSkills(),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useSkillUsageCounts: () => new Map<string, number>(),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import SkillDetailPage from "./page";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillDetailPage (/skills/:id)", () => {
  it("keeps the full skill list visible next to the detail pane", () => {
    mockUseSkills.mockReturnValue({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() });
    renderWithIntl(<SkillDetailPage />);
    // both list entries stay visible, not just the selected one
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("security-checklist")).toBeInTheDocument();
    // detail pane rendered for the id from the route
    expect(screen.getByTestId("detail-stub")).toHaveTextContent("Detail for sk1");
  });
});
