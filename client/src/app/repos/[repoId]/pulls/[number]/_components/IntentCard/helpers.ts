/* IntentCard/helpers — pure helpers for rendering an Intent record's sources.
   No React, no I18n: components apply translations at render time. */
import type { IntentSource } from "@devdigest/shared";

/** Sources whose content could not be fetched (unreachable/unsupported) — the
   basis for the "missing context" warning line (R8c). */
export function missingSources(sources: IntentSource[]): IntentSource[] {
  return sources.filter((src) => src.status === "unreachable" || src.status === "unsupported");
}

/** One-line label for a source chip: "<kind> <ref> · <status>" (ref omitted
   when absent, e.g. the file_list source has no ref). */
export function sourceLabel(source: IntentSource): string {
  const ref = source.ref ? ` ${source.ref}` : "";
  return `${source.kind}${ref} · ${source.status}`;
}
