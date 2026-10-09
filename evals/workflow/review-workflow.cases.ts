import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (root CLAUDE.md + per-package
 * CLAUDE.md→AGENTS.md + skills + subagents, loaded via settingSources:["project"]) behaves as
 * documented. Organized by scenario, not by a single artifact, because these behaviors are
 * cross-cutting.
 *
 * Budget: 7 Claude sessions total (was ~14 as one-scenario-per-session).
 *   - 5 × trace → 1 session each                            = 5
 *   - 1 × activation pair (positive + near-miss negative)   = 2
 *
 * Merging rules (why some things are NOT merged):
 *   - Facets merge only when they don't contaminate each other. A negative (expectNotRead,
 *     shouldActivate:false) needs a session where nothing else pulls the forbidden read in, so the
 *     client-only session carries the "no server/Insights.md" check and the activation pair stays apart.
 *   - Text assertions disable the early stop (the answer exists only at the end), so they live in
 *     their own cheap Q&A session instead of riding on a dispatch session that should stop early.
 *   - A subagent dispatch, when merged, is the LAST step of the prompt: the session stops as soon
 *     as every facet is in, so the nested subagent never runs to completion.
 *
 * Nested CLAUDE.md files are injected by Claude Code when the agent touches a file in that folder —
 * NOT via a Read tool call — so they never show up in filesRead. We assert their EFFECT instead:
 * each package's "Session protocol" (read <pkg>/Insights.md) and "Read When" rows exist only in
 * the nested file, not in the root one.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): client/ nested CLAUDE.md — session protocol + two Read When rows -------
  {
    kind: "trace",
    name: "client: nested CLAUDE.md → Insights.md + pages.md + ui-architecture.md, no server reads",
    prompt:
      "Працюю над фронтендом у client/. Три задачі по черзі; перед кожною дотримуйся настанов цього " +
      "пакета щодо того, що треба прочитати. Код не пиши — лише короткий план.\n" +
      "1) Відкрий client/src/app/agents/_components/AgentCard/AgentCard.tsx і скажи, що там можна покращити.\n" +
      "2) Хочу додати нову сторінку зі списком ранів рев'ю — звірся з документацією про маршрути.\n" +
      "3) Не знаю, чи логіку фільтрації ранів класти на сервер чи на клієнт — звірся з документацією.",
    expectFilesRead: ["client/Insights.md", "client/specs/pages.md", "client/docs/ui-architecture.md"],
    expectNotRead: ["server/Insights.md"],
    maxTurns: 14,
  },

  // --- trace (1 session): server/ + reviewer-core/ routing, then architecture-reviewer dispatch --
  {
    kind: "trace",
    // The Slack adapter must NOT already exist, or the model reviews existing code inline instead
    // of planning-then-dispatching. Dispatch is the last step so the early stop skips its full run.
    name: "backend: server + reviewer-core Read When routing, then dispatches architecture-reviewer",
    prompt:
      "Задачі в бекенді, по черзі; перед кожною дотримуйся настанов відповідного пакета щодо того, " +
      "що треба прочитати.\n" +
      "1) Відкрий server/src/modules/reviews/service.ts і коротко поясни, де там запускається ран рев'ю.\n" +
      "2) Плануємо додати НОВИЙ, ще не реалізований адаптер для Slack-нотифікацій — звірся з документацією, " +
      "яку для цього вимагає server.\n" +
      "3) Також хочемо додати поле `category` у Finding — звірся з тим, що reviewer-core вимагає прочитати " +
      "при зміні форми Finding.\n" +
      "4) Наостанок ОБОВ'ЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив план зі " +
      "Slack-адаптером на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/Insights.md", "server/docs/architecture.md", "reviewer-core/specs/review-contract.md"],
    expectSubagents: ["architecture-reviewer"],
    // Observed 13–22 turns with maxTurns 12 → run 1 hit the cap before dispatching.
    maxTurns: 24,
  },

  // --- trace (1 session): root CLAUDE.md Map/Docs + e2e/ and mcp-server/ routing ---------------
  {
    kind: "trace",
    name: "root: CLAUDE.md Docs/Map route to TESTING.md, agent-prompts, mcp README",
    prompt:
      "Кілька питань про репо. На кожне відповідай коротко, але СПЕРШУ прочитай саме ту документацію, " +
      "на яку для цього вказують настанови репо (CLAUDE.md / AGENTS.md пакетів):\n" +
      "1) Як влаштовані тести та CI — коли запускається який набір?\n" +
      "2) Де лежать еталонні system prompt'и рев'юерів?\n" +
      "3) Як підключити MCP-сервер DevDigest?",
    expectFilesRead: ["TESTING.md", "docs/agent-prompts", "mcp-server/README.md"],
    maxTurns: 12,
  },

  // --- trace (1 session): e2e/ nested CLAUDE.md → specs/flows.md --------------------------------
  // Split out of the root session: as the 4th of 4 questions, cheap models stopped at e2e/AGENTS.md
  // one hop short of flows.md. Alone it still needs two hops (root Map → e2e/AGENTS.md Read When).
  {
    kind: "trace",
    name: "e2e: nested CLAUDE.md Read When routes a new-flow question to specs/flows.md",
    prompt:
      "Хочу додати новий e2e flow — що треба знати? Відповідай коротко, але спершу прочитай ту " +
      "документацію, на яку для цього вказують настанови репо.",
    expectFilesRead: ["e2e/specs/flows.md"],
    maxTurns: 8,
  },

  // --- trace + text (1 session): root CLAUDE.md Gotchas/Conventions answered from context -------
  // No reads are required — the root CLAUDE.md is already in context — so this is cheap. The
  // "never `down -v` to restart" rule is deliberately absent: a good answer *mentions* `down -v`
  // in order to warn against it, so a substring check can't tell warning from advice (judge territory).
  {
    kind: "trace",
    name: "root: Gotchas & Conventions show up in the answer (migrate, port 5432, path alias)",
    prompt:
      "Три проблеми, відповідай коротко на кожну з урахуванням настанов цього репо:\n" +
      "1) API падає з помилкою `relation \"reviews\" does not exist` — що робити?\n" +
      "2) docker compose не стартує: `port 5432 is already allocated`.\n" +
      "3) Хочу підключити reviewer-core до server як npm-залежність у package.json — як правильно?",
    expectText: ["db:migrate", /docker-compose\.yml|зупин|stop/i, /path alias|tsconfig/i],
    maxTurns: 6,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  // Cannot merge: the negative must run in a session where nothing else triggers the skill.
  // maxTurns 8: at 4 both sessions hit the cap (5–6 turns observed) while still exploring code.
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    // The skill's "Evidence only, never invented" rule, made measurable: the write is refused by
    // the isolation, but its text (or the entry quoted in the answer) is judged. Before this, a run "recorded" that pgvector silently
    // drops mismatched vectors — a mechanism neither the user nor any file stated.
    writePractices: [
      "Every factual claim in ATTEMPTED WRITE and in any entry text quoted in FINAL ANSWER (cause, mechanism, " +
        "numbers, versions, error behaviour, fix) is stated in USER PROMPT or appears in SOURCES. If there is no " +
        "such text (e.g. the session asked the user for evidence instead), PASS. If any claim is in neither source, " +
        "FAIL and quote that claim.",
      "FINAL ANSWER does not tell the user the entry was saved, recorded or added — WRITE STATUS says nothing was " +
        "saved. PASS if it reports the failure, asks for evidence, or makes no success claim; if it claims success, " +
        "FAIL and quote it.",
    ],
    threshold: 1,
    maxTurns: 8,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 8,
  },
];
