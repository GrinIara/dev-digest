import type { ContextDocType } from "@/lib/types";

export const DOC_TYPE_COLORS: Record<ContextDocType, { color: string; bg: string }> = {
  specs: { color: "var(--accent-text)", bg: "var(--bg-hover)" },
  docs: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  insights: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
