/**
 * The headless turn-loop driver. Runs one Claude Agent SDK session on the subscription and
 * extracts what the session ACTUALLY did (tools, subagents, skills, reads) — not its prose.
 */

import { query, type HookCallback, type Options } from "@anthropic-ai/claude-agent-sdk";
import { EVAL_MODEL, MAX_TURNS, SPAWN_TOOLS } from "../config.js";
import { REPO_ROOT } from "../artifacts/paths.js";
import { MUTATING_TOOLS } from "../artifacts/load.js";
import { subscriptionEnv } from "./env.js";

export interface Metrics {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Total tool_use blocks seen (NOT deduplicated — a measure of work done). */
  toolCallCount: number;
}

export interface Result {
  text: string;
  toolsUsed: string[];
  subagents: string[];
  /** Skills activated via the Skill tool (workflow mode); name may be "plugin:skill". */
  skillsInvoked: string[];
  filesRead: string[];
  /**
   * Tool calls the read-only isolation refused — by the `tools` restriction ("No such tool
   * available") or the PreToolUse guard — as `Tool` (main thread) or `Tool@subagent`. Non-empty
   * means the session TRIED to act outside the allow-list (e.g. write Insights.md) and was stopped.
   */
  toolsBlocked: string[];
  /**
   * Every Write/Edit/NotebookEdit call the session (or a subagent) attempted, with the text it
   * tried to write. Under the read-only isolation these are all refused — but the text is still
   * what the model WOULD have persisted, so a judge can check it (e.g. for invented claims).
   */
  writesAttempted: WriteAttempt[];
  numTurns: number;
  isError: boolean;
  metrics: Metrics;
}

export interface WriteAttempt {
  tool: string;
  file: string;
  text: string;
  bySubagent: boolean;
}

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export interface RunOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  /**
   * Tools removed from the session. Defaults to the mutating tools: under bypassPermissions,
   * allowedTools only pre-approves — any tool NOT listed is still callable — so this is what
   * actually keeps a run read-only on the live repo. Pass [] to opt out deliberately.
   */
  disallowedTools?: string[];
  maxTurns?: number;
  cwd?: string;
  model?: string;
  /** ["project"] loads on-disk CLAUDE.md + skills/agents; default [] keeps the run isolated. */
  settingSources?: Array<"user" | "project" | "local">;
  /**
   * Early-stop hook. Called after every tool_use with the trace collected SO FAR; return true to
   * end the session immediately. Lets a dispatch/trace case stop the moment its evidence is in
   * (e.g. the subagent was launched) instead of waiting for a heavy nested subagent to finish.
   * On an early stop the run is NOT an error and metrics reflect only what ran before the stop.
   */
  stopWhen?: (partial: Pick<Result, "subagents" | "filesRead" | "skillsInvoked" | "toolsUsed">) => boolean;
}

/** Run one headless Claude turn-loop and extract what it ACTUALLY did (not its prose). */
export async function runClaude(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const allowedTools = opts.allowedTools ?? [];
  // With no tools, a subagent/skill prompt that says "read files" will loop on denied tool
  // calls until max-turns. For these content-only evals the input is already in the prompt,
  // so tell the model to answer directly.
  let systemPrompt = opts.systemPrompt;
  if (allowedTools.length === 0) {
    const directive =
      "\n\nYou have NO tools available in this session. Do not attempt any tool calls. " +
      "Answer directly and completely from the information given in the prompt.";
    systemPrompt = (systemPrompt ?? "") + directive;
  }

  // Read-only isolation, three layers (sessions run with bypassPermissions on the LIVE repo):
  //   1. `tools` — the ONLY built-ins the model sees. `allowedTools` alone just pre-approves; the
  //      rest of the Claude Code toolset (Task, Workflow, RemoteTrigger, CronCreate, …) stays callable.
  //   2. `disallowedTools` — belt-and-braces removal of the mutating tools.
  //   3. PreToolUse hook — denies any call outside the allow-list, INCLUDING calls made inside a
  //      subagent (hooks fire for subagent tools; `tools`/`disallowedTools` may not reach them).
  //      This is what stops a dispatched subagent from writing to the repo.
  const permitted = new Set(allowedTools);
  const blocked: string[] = [];
  const readOnlyGuard: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse" || permitted.has(input.tool_name)) return { continue: true };
    blocked.push(input.agent_id ? `${input.tool_name}@subagent` : input.tool_name);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Eval sandbox is read-only: ${input.tool_name} is not allowed. Answer in text instead.`,
      },
    };
  };

  const options: Options = {
    model: opts.model ?? EVAL_MODEL,
    maxTurns: opts.maxTurns ?? MAX_TURNS,
    permissionMode: "bypassPermissions", // safe: the read-only guard below denies everything else
    systemPrompt,
    tools: allowedTools,
    allowedTools,
    // mcp__*: the project .mcp.json (devdigest) loads under settingSources:["project"], and its
    // run_agent_on_pr starts a PAID review run — never hand MCP tools to an eval session.
    disallowedTools: opts.disallowedTools ?? [...MUTATING_TOOLS, "mcp__*"],
    hooks: { PreToolUse: [{ hooks: [readOnlyGuard] }] },
    cwd: opts.cwd ?? REPO_ROOT,
    // Default: do NOT load on-disk config — isolates the injected artifact. workflowTask overrides.
    settingSources: opts.settingSources ?? [],
    env: subscriptionEnv(),
  };

  const textParts: string[] = [];
  const tools: string[] = [];
  const subagents: string[] = [];
  const skills: string[] = [];
  const reads: string[] = [];
  // tool_use id → name (+ whether it came from a subagent), to label refused calls below.
  const toolNames = new Map<string, string>();
  const writes: WriteAttempt[] = [];
  let resultText = "";
  let isError = false;
  let numTurns = 0;
  let toolCallCount = 0;
  // Resource metrics, read defensively off the result message (field names verified against the
  // installed SDK's types). On the subscription path total_cost_usd is meaningless, so we ignore
  // it and surface tokens only. Fall back to 0 whenever a field is absent — never throw.
  let durationMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let stoppedEarly = false;
  // Wall-clock fallback: on an early stop we break before the result message that carries
  // duration_ms/usage, so those stay 0. Stamp duration ourselves, and accumulate output tokens
  // off each assistant message, so an early-stopped case still reports meaningful metrics.
  const startedAt = Date.now();

  // The SDK throws on an error result (e.g. max-turns). We still want the partial output
  // and the tool/subagent trace we collected, so catch and fall through with isError=true.
  try {
    loop: for await (const msg of query({ prompt, options })) {
      if (msg.type === "assistant") {
        numTurns++;
        outputTokens += (msg.message as any).usage?.output_tokens ?? 0;
        for (const block of msg.message.content as any[]) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") {
            tools.push(block.name);
            toolNames.set(block.id, (msg as any).parent_tool_use_id ? `${block.name}@subagent` : block.name);
            toolCallCount++;
            const input = block.input ?? {};
            if (SPAWN_TOOLS.has(block.name)) {
              const sub = input.subagent_type ?? input.agent_type ?? input.name;
              if (sub) subagents.push(sub);
            }
            if (WRITE_TOOLS.has(block.name)) {
              // Write: content · Edit: new_string · MultiEdit: edits[] · ad-hoc shapes: text.
              const text =
                input.content ??
                input.new_string ??
                input.new_source ??
                (Array.isArray(input.edits) ? input.edits.map((e: any) => e.new_string).join("\n") : undefined) ??
                input.text ??
                JSON.stringify(input);
              writes.push({
                tool: block.name,
                file: input.file_path ?? input.notebook_path ?? input.path ?? "?",
                text: String(text),
                bySubagent: Boolean((msg as any).parent_tool_use_id),
              });
            }
            if (block.name === "Read") {
              const fp = input.file_path ?? input.path;
              if (fp) reads.push(fp);
            }
            // A Glob over a folder is how a "where does X live?" question is answered — count its
            // target as a read too (as `path/pattern`), or listing docs/agent-prompts/ looks like a miss.
            if (block.name === "Glob" && input.pattern) {
              reads.push(input.path ? `${input.path}/${input.pattern}` : input.pattern);
            }
            if (block.name === "Skill") {
              const s = input.skill ?? input.command;
              if (s) skills.push(s);
            }
            // Evidence is in — break the loop before a heavy nested subagent runs to completion.
            // Breaking the async iterator triggers its return()/abort, tearing down the subprocess.
            if (
              opts.stopWhen?.({
                subagents: [...new Set(subagents)],
                filesRead: reads,
                skillsInvoked: [...new Set(skills)],
                toolsUsed: [...new Set(tools)],
              })
            ) {
              stoppedEarly = true;
              break loop;
            }
          }
        }
      } else if (msg.type === "user") {
        // A tool outside `tools` never reaches the PreToolUse hook — the runtime refuses it as
        // "No such tool available" (this is how a subagent's Edit/Bash is stopped). Count those too.
        const content = (msg as any).message?.content;
        for (const b of Array.isArray(content) ? content : []) {
          if (b?.type !== "tool_result" || !b.is_error) continue;
          const body = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
          if (/No such tool available/.test(body)) blocked.push(toolNames.get(b.tool_use_id) ?? "unknown");
        }
      } else if (msg.type === "result") {
        isError = msg.subtype !== "success";
        const m = msg as any;
        numTurns = m.num_turns ?? 0;
        durationMs = m.duration_ms ?? 0;
        inputTokens = m.usage?.input_tokens ?? 0;
        outputTokens = m.usage?.output_tokens ?? 0;
        if (m.result) resultText = m.result;
      }
    }
  } catch (err) {
    isError = true;
    if (!resultText && textParts.length === 0) {
      throw err; // nothing usable collected — surface the failure
    }
  }

  // Early stop never reached the result message, so fall back to the wall-clock duration.
  if (stoppedEarly && durationMs === 0) durationMs = Date.now() - startedAt;

  return {
    text: resultText || textParts.join("\n"),
    toolsUsed: [...new Set(tools)],
    subagents: [...new Set(subagents)],
    skillsInvoked: [...new Set(skills)],
    filesRead: reads,
    toolsBlocked: blocked,
    writesAttempted: writes,
    numTurns,
    isError,
    metrics: { durationMs, inputTokens, outputTokens, toolCallCount },
  };
}
