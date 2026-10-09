/**
 * Load a skill / agent artifact from disk as text, to inject as a system prompt. This is what
 * makes skillTask/agentTask measure the artifact's CONTENT in isolation.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR, AGENTS_DIR } from "./paths.js";

function stripFrontmatter(md: string): string {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(end + 4).replace(/^\n+/, "");
  }
  return md;
}

/** SKILL.md plus every references/*.md — the full payload the harness would assemble. */
export function skillContent(skillName: string): string {
  const dir = join(SKILLS_DIR, skillName);
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) throw new Error(`SKILL.md not found: ${skillMd}`);
  const parts = [readFileSync(skillMd, "utf8")];
  const refs = join(dir, "references");
  if (existsSync(refs)) {
    for (const f of readdirSync(refs).filter((f) => f.endsWith(".md")).sort()) {
      parts.push(`\n\n## Reference: ${f}\n\n${readFileSync(join(refs, f), "utf8")}`);
    }
  }
  return parts.join("\n");
}

/** An agent definition with its frontmatter stripped (the behavioral prompt only). */
export function agentContent(agentName: string): string {
  const f = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(f)) throw new Error(`agent not found: ${f}`);
  return stripFrontmatter(readFileSync(f, "utf8"));
}

/** The raw frontmatter block of an agent definition ("" when it has none). */
function agentFrontmatter(agentName: string): string {
  const f = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(f)) throw new Error(`agent not found: ${f}`);
  const md = readFileSync(f, "utf8");
  const fmEnd = md.startsWith("---") ? md.indexOf("\n---", 3) : -1;
  return fmEnd !== -1 ? md.slice(0, fmEnd) : "";
}

/**
 * The skills an agent PRELOADS via frontmatter (`skills:` as a YAML list or `[a, b]`). Claude Code
 * injects each one's SKILL.md into the subagent's context at startup, and agent bodies rely on it
 * ("the preloaded … skills") — so an eval that injects only the body tests a different agent.
 */
export function agentSkills(agentName: string): string[] {
  const fm = agentFrontmatter(agentName);
  const inline = fm.match(/^skills:\s*\[(.*)\]\s*$/m);
  if (inline) return inline[1].split(",").map((s) => s.trim()).filter(Boolean);
  const block = fm.match(/^skills:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
  if (!block) return [];
  return block[1]
    .split("\n")
    .map((l) => l.replace(/^[ \t]+-\s*/, "").trim())
    .filter(Boolean);
}

/** The preloaded skills' SKILL.md bodies, formatted for appending to the agent's system prompt. */
export function agentSkillsContent(agentName: string): string {
  return agentSkills(agentName)
    .map((name) => {
      const f = join(SKILLS_DIR, name, "SKILL.md");
      if (!existsSync(f)) throw new Error(`skill '${name}' preloaded by agent '${agentName}' not found: ${f}`);
      return `\n\n## Preloaded skill: ${name}\n\n${stripFrontmatter(readFileSync(f, "utf8"))}`;
    })
    .join("");
}

// Tools the eval refuses to hand a subagent: evals run with bypassPermissions against the LIVE
// repo, so a mutating tool could take real actions. An agent that declares these still runs — it
// just runs read-only, which is all an eval ever needs. Exported so runClaude can also DISALLOW
// them: allowedTools only pre-approves, it does not remove the rest under bypassPermissions.
export const MUTATING_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "Bash"]);
const READONLY_FALLBACK = ["Read", "Grep", "Glob"];

/**
 * The tools an agent DECLARES in its frontmatter (`tools: Read, Glob, Grep`), so the eval can run
 * a tool-using agent the way production does instead of crippling it to content-only. Derived per
 * agent from its own declaration — no per-agent wiring. Returns [] when the agent declares no
 * tools (genuine content-only agent). Mutating tools are stripped for safety; a `*` / "All tools"
 * grant collapses to the read-only fallback rather than handing over Write/Bash on the live repo.
 */
export function agentTools(agentName: string): string[] {
  const line = agentFrontmatter(agentName).match(/^tools:\s*(.+)$/m);
  if (!line) return [];
  const raw = line[1].trim();
  if (raw === "*" || /all tools/i.test(raw)) return [...READONLY_FALLBACK];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !MUTATING_TOOLS.has(t));
}
