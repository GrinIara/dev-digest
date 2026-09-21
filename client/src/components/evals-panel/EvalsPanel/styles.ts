import type { CSSProperties } from "react";

export const s: Record<string, CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  case: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  caseHeader: { display: "flex", alignItems: "center", gap: 10 },
  caseName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1 },
  caseMeta: { fontSize: 12, color: "var(--text-muted)" },
  caseActions: { display: "flex", alignItems: "center", gap: 6 },
  runsList: { display: "flex", flexDirection: "column", gap: 4, marginTop: 4 },
  runRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    color: "var(--text-secondary)",
    padding: "4px 0",
    borderTop: "1px solid var(--border)",
  },
};
