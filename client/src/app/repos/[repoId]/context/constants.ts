import type { ContextDocType } from "@/lib/types";

export const DOC_TYPE_COLORS: Record<ContextDocType, { color: string; bg: string }> = {
  specs: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
};

export const SKELETON_ROWS = 6;
