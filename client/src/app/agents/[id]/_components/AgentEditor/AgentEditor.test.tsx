import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// ---- Mocked hooks/api (this package's convention: mock the hook module, not
// a real fetch; the Skills tab reads the workspace skill list through the
// shared `useSkills()` hook, which calls `api.get` under the hood, so the
// `lib/api` mock below backs that real hook instead of being read directly). --

const updateMutate = vi.fn();
const setSkillsMutate = vi.fn();

const SKILLS: Skill[] = [
  { id: "sk1", name: "Security Rubric", description: "", type: "security", source: "manual", body: "", enabled: true, version: 1 },
  { id: "sk2", name: "Style Convention", description: "", type: "convention", source: "manual", body: "", enabled: true, version: 1 },
];
const AGENT_SKILL_LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk1", order: 0 }];

vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: updateMutate, isPending: false, isSuccess: false, data: undefined }),
  useAllModels: () => ({
    data: [
      { id: "gpt-4.1", provider: "openai" },
      { id: "gpt-4.1", provider: "openrouter", pricing: { promptPerM: 1, completionPerM: 2 } },
    ],
  }),
  useAgentSkills: () => ({ data: AGENT_SKILL_LINKS, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));

vi.mock("../../../../../lib/api", () => ({
  api: { get: vi.fn(() => Promise.resolve(SKILLS)) },
}));

import { AgentEditor } from "./AgentEditor";

afterEach(() => {
  cleanup();
  updateMutate.mockClear();
  setSkillsMutate.mockClear();
});

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

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders exactly the two tab labels — Config and Skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    for (const label of ["Config", "Skills"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of ["Context", "Evals", "Stats", "CI"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("moves strategy/repo-intel/CI-gate behind an Advanced disclosure", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    // Collapsed by default.
    expect(screen.queryByText("Review strategy")).not.toBeInTheDocument();
    expect(screen.queryByText("Repo intelligence")).not.toBeInTheDocument();
    expect(screen.queryByText("CI gate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Advanced"));
    // Folded back into Config now that the Context/CI tabs are gone.
    expect(screen.getByText("Review strategy")).toBeInTheDocument();
    expect(screen.getByText("Repo intelligence")).toBeInTheDocument();
    expect(screen.getByText("CI gate")).toBeInTheDocument();
  });

  it("saves repo_intel and ci_fail_on alongside the rest of the Config patch", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    fireEvent.click(screen.getByText("Save agent"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ag1",
        patch: expect.objectContaining({ repo_intel: true, ci_fail_on: "critical" }),
      }),
      expect.anything(),
    );
  });
});

describe("Config tab — cross-provider model picker", () => {
  it("shows provider-prefixed options and saves both provider and model on selection", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    // Open the picker by clicking its closed-state trigger (shows the current
    // selection's label — unique before the dropdown/options render).
    fireEvent.click(screen.getByText("openai · gpt-4.1"));
    // Two entries share the bare id "gpt-4.1" — provider prefix disambiguates.
    expect(screen.getByPlaceholderText("Search models…")).toBeInTheDocument();
    expect(screen.getByText(/openrouter · gpt-4\.1 — \$1\.00\/\$2\.00 per 1M/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/openrouter · gpt-4\.1/));
    fireEvent.click(screen.getByText("Save agent"));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ag1",
        patch: expect.objectContaining({ provider: "openrouter", model: "gpt-4.1" }),
      }),
      expect.anything(),
    );
  });
});

describe("Skills tab", () => {
  it("shows the bound/total count and posts the full ordered skill_ids on checkbox toggle", async () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    expect(await screen.findByText("1 of 2 enabled")).toBeInTheDocument();
    expect(screen.getByText("Security Rubric")).toBeInTheDocument();
    expect(screen.getByText("Style Convention")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    // sk1 (Security Rubric) starts checked; sk2 (Style Convention) starts unchecked.
    fireEvent.click(checkboxes[1]!);

    expect(setSkillsMutate).toHaveBeenCalledWith({ id: "ag1", skillIds: ["sk1", "sk2"] });
  });

  it("filters the rendered rows by name via the filter box", async () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    await screen.findByText("Security Rubric");
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "style" } });
    expect(screen.queryByText("Security Rubric")).not.toBeInTheDocument();
    expect(screen.getByText("Style Convention")).toBeInTheDocument();
  });

  it("only makes bound/checked rows draggable", async () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    await screen.findByText("Security Rubric");
    const boundRow = screen.getByText("Security Rubric").closest("div[draggable]");
    const unboundRow = screen.getByText("Style Convention").closest("div[draggable]");
    expect(boundRow).toHaveAttribute("draggable", "true");
    expect(unboundRow).toHaveAttribute("draggable", "false");
  });
});
