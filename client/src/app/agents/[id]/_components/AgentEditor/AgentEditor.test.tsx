import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { ToastProvider } from "../../../../../lib/toast";

// ---- Mocked hooks/api (this package's convention: mock the hook module, not
// a real fetch; the Skills tab's inline `GET /skills` read is the one call
// that goes through `api` directly instead of a hook, so it's mocked there). --

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

vi.mock("../../../../../lib/hooks/eval", () => ({
  useEvalCases: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useEvalCaseRuns: () => ({ data: [] }),
  useCreateEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn() }),
  useRunEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
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
      <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages }}>
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

  it("renders all six tab labels", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    for (const label of ["Config", "Skills", "Context", "Evals", "Stats", "CI"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("moves strategy behind an Advanced disclosure and drops provider/repo-intel/CI-gate fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    // Strategy is collapsed by default.
    expect(screen.queryByText("Review strategy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Advanced"));
    expect(screen.getByText("Review strategy")).toBeInTheDocument();
    // Moved to Context/CI tabs — no longer in Config.
    expect(screen.queryByText("Repo intelligence")).not.toBeInTheDocument();
    expect(screen.queryByText("CI gate")).not.toBeInTheDocument();
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
});

describe("Context tab", () => {
  it("renders the repo-intel toggle", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Context" })).toBeInTheDocument();
    expect(screen.getByText("Repo intelligence")).toBeInTheDocument();
  });
});

describe("CI tab", () => {
  it("renders the CI gate select and an honest empty state for run history", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="ci" onTab={() => {}} />);
    expect(screen.getByText("CI gate")).toBeInTheDocument();
    expect(screen.getByText("No CI runs yet")).toBeInTheDocument();
  });
});

describe("Stats tab", () => {
  it("renders an honest not-enough-data state", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="stats" onTab={() => {}} />);
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
  });
});

describe("Evals tab", () => {
  it("renders the shared EvalsPanel", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(screen.getByText("New case")).toBeInTheDocument();
  });
});
