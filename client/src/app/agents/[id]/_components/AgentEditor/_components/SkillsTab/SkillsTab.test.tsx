import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const setSkillsMutate = vi.fn();
const AGENT_SKILL_LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk1", order: 0 }];

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: AGENT_SKILL_LINKS, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
  useAgents: () => ({ data: [] }),
}));

const apiGet = vi.fn();
vi.mock("../../../../../../../lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
}));

// Do not mock lib/hooks/skills — the real useSkills() hook is under test.

import { SkillsTab } from "./SkillsTab";

const SKILLS: Skill[] = [
  { id: "sk1", name: "Security Rubric", description: "", type: "security", source: "manual", body: "", enabled: true, version: 1 },
  { id: "sk2", name: "Style Convention", description: "", type: "convention", source: "manual", body: "", enabled: true, version: 1 },
];

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

afterEach(() => {
  cleanup();
  apiGet.mockReset();
  setSkillsMutate.mockClear();
});

function renderTab(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <SkillsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillsTab (F1 — reads skills through useSkills())", () => {
  it('renders skills already in the shared ["skills"] cache', async () => {
    apiGet.mockReturnValue(new Promise(() => {})); // never resolves
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["skills"], SKILLS);

    renderTab(qc);

    expect(await screen.findByText("1 of 2 enabled")).toBeInTheDocument();
    expect(screen.getByText("Security Rubric")).toBeInTheDocument();
    expect(screen.getByText("Style Convention")).toBeInTheDocument();
  });

  it('refetches and shows renamed skills when ["skills"] is invalidated', async () => {
    const renamed = SKILLS.map((sk) => (sk.id === "sk1" ? { ...sk, name: "Security Rubric v2" } : sk));
    apiGet.mockResolvedValueOnce(SKILLS).mockResolvedValueOnce(renamed);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderTab(qc);

    await screen.findByText("Security Rubric");
    await act(() => qc.invalidateQueries({ queryKey: ["skills"] }));

    expect(await screen.findByText("Security Rubric v2")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet).toHaveBeenNthCalledWith(1, "/skills");
    expect(apiGet).toHaveBeenNthCalledWith(2, "/skills");
  });
});
