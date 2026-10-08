import type { BriefMissingInput, Risk, RiskSeverity } from "@devdigest/shared";

const SEVERITY_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

/** High → medium → low; model order within one severity (stable sort). */
export function sortRisks(risks: Risk[]): Risk[] {
  return risks
    .map((risk, index) => ({ risk, index }))
    .sort((a, b) => SEVERITY_ORDER[a.risk.severity] - SEVERITY_ORDER[b.risk.severity] || a.index - b.index)
    .map((x) => x.risk);
}

/** 8200 → "8.2K", 1300 → "1.3K", 950 → "950". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}K`;
}

/** 0.014 → "$0.014". */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(3)}`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return fmt.format(0, "second");
}

/** Translation key (under the `brief` namespace) for a missing-input entry. */
export function missingInputKey(entry: Pick<BriefMissingInput, "input" | "reason">): string {
  return `missing.${entry.input}.${entry.reason}`;
}

/** "src/a.ts:12-20" → "src/a.ts" (refs are `path`, `path:N` or `path:A-B`). */
export function refPath(ref: string): string {
  const i = ref.lastIndexOf(":");
  if (i < 0) return ref;
  return /^\d+(-\d+)?$/.test(ref.slice(i + 1)) ? ref.slice(0, i) : ref;
}
