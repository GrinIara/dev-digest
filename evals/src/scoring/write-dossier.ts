/**
 * Evidence pack for judging what a session tried to persist (see `writePractices` on activation
 * cases). Kept out of dsl/case.ts so it can be used outside a vitest run (e.g. re-judging saved
 * records without paying for new sessions).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import type { Result } from "../runtime/run-claude.js";

// Caps keep the judge prompt bounded: a session can read big files (schema dumps, migrations).
const DOSSIER_MAX_FILES = 6;
const DOSSIER_MAX_CHARS = 8_000;

/**
 * Evidence pack for judging an attempted write. Read files are re-read from disk: the session ran
 * read-only, so their content is exactly what the model saw. The WRITE STATUS line is the ground
 * truth the final answer must not contradict.
 */
export function writeDossier(prompt: string, result: Pick<Result, "filesRead" | "writesAttempted" | "text">): string {
  const files = [...new Set(result.filesRead)]
    .filter((f) => existsSync(f) && statSync(f).isFile())
    .slice(0, DOSSIER_MAX_FILES);
  const sources = files
    .map((f) => {
      const body = readFileSync(f, "utf8");
      const cut = body.length > DOSSIER_MAX_CHARS ? `${body.slice(0, DOSSIER_MAX_CHARS)}\n[…truncated]` : body;
      return `### ${f}\n${cut}`;
    })
    .join("\n\n");
  const writes = result.writesAttempted
    .map((w) => `### ${w.tool}${w.bySubagent ? " (subagent)" : ""} → ${w.file}\n${w.text}`)
    .join("\n\n");
  // Two different ground truths: refused writes vs. no write at all. Both mean nothing was saved —
  // the second is how a session can "record" a finding without ever touching a file.
  const status = writes
    ? "BLOCKED — every write above was refused; nothing was saved to any file."
    : "NOTHING WRITTEN — the session attempted no Write/Edit at all; nothing was saved to any file.";
  return [
    `## USER PROMPT\n${prompt}`,
    `## SOURCES (files the session read)\n${sources || "(none)"}`,
    `## ATTEMPTED WRITE\n${writes || "(none)"}`,
    `## WRITE STATUS\n${status}`,
    `## FINAL ANSWER (shown to the user)\n${result.text}`,
  ].join("\n\n");
}
