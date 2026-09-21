import type { LogLine } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/** Compact USD cost (e.g. "$0.06", "$0.014", "$0.0013"); "—" when unknown
 *  (never "$0.00" — that would misrepresent missing data as a free run). */
export function formatCost(usd: number | null): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  return `$${Number(usd.toPrecision(2))}`;
}

/** Cheap client-side token estimate (chars/4) for a single prompt block —
 *  deliberately NOT the whole-run tokens_in/tokens_out stat, so a reader can
 *  see how much of the budget one block (e.g. skills) actually costs. */
export function approxTokenCount(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
