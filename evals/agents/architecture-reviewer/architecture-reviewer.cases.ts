import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The fixtures describe proposed changes that are NOT applied to the working tree, so the agent's
// default review set (git diff vs merge-base) would review the wrong thing. Every prompt hands it
// the diff as the review set and points it at the real rule sources, which DO exist in the repo.
const reviewPrompt = (diff: string) => `Review the proposed change below. It is not applied to the working tree, so treat this diff as the complete review set: do not review git status / git diff, and do not report that the touched files are missing on disk. Read the repo's documented rule sources as usual, then return your Architecture Review Report.

${diff}`;

// Two deliberate violations, both mapped to rules the agent's sources document:
// - a value import of FastifyReply in the domain/contracts layer (server/src/vendor/shared/contracts)
//   — backend-onion-architecture SKILL.md layer map "No imports of Fastify"; a dependency-direction
//   violation, so critical. It is a value import on purpose: the agent caps a type-only cross-layer
//   import at minor.
//   The change is server-only, so a missing client/ mirror (XP2) is an expected side finding. It is
//   not mirrored on purpose: a client copy importing fastify would itself be a problem.
//   The agent's catalog has no check ID for contracts importing fastify (AB2 covers service.ts
//   only), so the citation practice accepts the skill's rule as the source and does NOT accept AB2
//   or the mirroring rule as the cited rule.
// - `new PgCheckoutRepository()` (a concrete class under src/adapters/) inside service.ts instead
//   of container.<port> — check AB3, critical. NOT the module's own repository.ts facade, which
//   SKILL.md documents as legitimately constructed by service.ts.
const CHECKOUT_PROMPT = reviewPrompt(fx("checkout-service.diff"));

// Violations that map onto reviewer-core-specific rules (RC1 + the documented mandatory
// groundFindings gate) — rules a competent model describes in prose but rarely names unless the
// agent forces a citation. Discriminates the strict vs lite variants on citation.
const REVIEWER_CORE_PROMPT = reviewPrompt(fx("reviewer-core-gate.diff"));

// A diff that violates no documented rule. Surfaces the COST of relaxing the citation rule: freed
// from "every finding is traceable to a rule source", the lite variant may invent a finding.
const BENIGN_PROMPT = reviewPrompt(fx("benign-refactor.diff"));

// Shared by architecture-reviewer (strict) and architecture-reviewer-lite (relaxed citation): same
// prompts, fixtures, practices, thresholds and maxTurns. Only the injected agent body differs, so
// the citation practices are the ones expected to move between the two runs.
export const cases: AgentCase[] = [
  {
    name: "checkout diff: finds both violations, rates severity, cites the documented rule",
    kind: "quality",
    prompt: CHECKOUT_PROMPT,
    // Cheap deterministic gate: both offending symbols must at least be mentioned before the judge runs.
    grounding: ["FastifyReply", "PgCheckoutRepository"],
    practices: [
      // Detection
      "reports as a finding that the domain/contracts file `server/src/vendor/shared/contracts/checkout.ts` imports `FastifyReply` from 'fastify', i.e. the innermost layer depends on the HTTP/delivery framework (dependency direction pointing outward)",
      "reports as a finding that `server/src/modules/checkout/service.ts` imports the concrete adapter `PgCheckoutRepository` from `src/adapters/` and constructs it with `new` inside the service, instead of resolving it through the DI container (`container.<port>` in `src/platform/container.ts`)",
      // Severity
      "assigns the FastifyReply-in-domain finding an explicit severity of `critical` (a dependency-direction violation; the import is a value import, not `import type`)",
      "assigns the `new PgCheckoutRepository()` finding an explicit severity of `critical` (check AB3's default)",
      // Rule citation — the practices the strict-vs-lite A/B is about
      "for the FastifyReply finding, cites a documented rule that actually covers the domain/contracts layer, with a file or file:line reference: the backend-onion-architecture skill's layer map ('Domain / contracts … No imports of Fastify') or its 'Dependencies point inward' rule. Saying that no catalog check ID covers this case is fine as long as that source is cited. Citing only AB2 (which is about modules/*/service.ts) or only the vendor/shared mirroring rule (XP2 / server/AGENTS.md) does NOT count, and neither does a prose-only description",
      "for the PgCheckoutRepository finding, names a specific documented rule rather than only describing the problem in prose: check ID `AB3` and/or the documented source (e.g. the backend-onion-architecture skill's 'service.ts importing a concrete adapter class … instead of going through container.<port>', or server/docs/architecture.md), with a file or file:line reference",
      // Consistency with the findings
      "the overall verdict is `blocking` (at least one critical finding)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "checkout diff: stays in scope and does not misflag the repository convention",
    kind: "quality",
    prompt: CHECKOUT_PROMPT,
    practices: [
      "the FastifyReply dependency-direction finding is not merged into or replaced by a missing-client/-mirror (XP2) finding. PASS if XP2 is not mentioned at all, or if it is reported as its own separate finding; FAIL only if the output folds the FastifyReply finding into XP2 or reports XP2 instead of it",
      "does not treat a module constructing its own `repository.ts` facade as a violation in general; the DI finding is specifically about a concrete class from `src/adapters/`",
      "does not raise naming, style, test-coverage or security comments as architecture findings (anything like that is only under the Out of scope section, not counted in the verdict)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "reviewer-core diff: finds the I/O import and the skipped grounding gate, cites the rule",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    grounding: ["readFileSync", "groundFindings"],
    practices: [
      "reports the `import { readFileSync } from \"node:fs\"` added to reviewer-core/src/pipeline/run.ts as a violation of reviewer-core purity (no filesystem/network/DB I/O)",
      "reports that runPipeline now returns `deduped` without passing findings through `groundFindings()`, the documented mandatory citation gate",
      "assigns the fs-import finding an explicit severity of `critical` (check RC1's default)",
      "for the fs-import finding, names check ID `RC1` and/or its documented source (reviewer-core/AGENTS.md, reviewer-core/docs/architecture.md or the backend-onion-architecture skill) rather than only describing it in prose",
      "for the skipped-gate finding, cites the documented source of the grounding rule (reviewer-core/AGENTS.md 'Grounding is mandatory…' or reviewer-core/docs/architecture.md 'the mandatory citation gate') rather than only describing it in prose",
      "the overall verdict is `blocking`",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "benign diff: reports no architecture violation",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no findings in the Findings section, or only `nit`-level items — no critical/major/minor finding is invented for a local-variable rename",
      "does not present a generic best-practice opinion as a violated rule",
      "the overall verdict is `pass`",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
