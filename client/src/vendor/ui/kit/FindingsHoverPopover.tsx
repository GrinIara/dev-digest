"use client";

/* FindingsHoverPopover — read-only floating preview shown on hover over a
   cluster of severity icons (PR list's FINDINGS column, PR detail's Timeline
   run tiles). No actions here by design — Accept/Reject only exist on the
   PR detail page's Review-runs accordion (FindingCard). Adapted from
   Dropdown's floating-panel pattern, but hover- rather than click-triggered. */
import React from "react";
import { SeverityBadge, CategoryTag } from "../primitives/Badge";
import type { Severity, Category } from "../primitives/tokens";

export interface FindingPreview {
  severity: Severity;
  title: string;
  category: Category;
  file: string;
  start_line: number;
  confidence: number;
  rationale: string;
}

export function FindingsHoverPopover({
  trigger,
  title,
  findings,
  align = "left",
}: {
  trigger: React.ReactNode;
  /** Popover header, e.g. "6 FINDINGS IN THIS RUN". */
  title: string;
  findings: FindingPreview[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = React.useState(false);
  if (findings.length === 0) return <>{trigger}</>;

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {trigger}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            [align]: 0,
            width: 380,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            padding: 12,
            zIndex: 40,
            animation: "ddpop .12s ease",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 10,
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {findings.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  paddingBottom: i < findings.length - 1 ? 10 : 0,
                  borderBottom: i < findings.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <SeverityBadge severity={f.severity} compact />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {f.title}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  <CategoryTag category={f.category} />
                  <span className="mono">
                    {f.file}:{f.start_line}
                  </span>
                  <span className="tnum">{Math.round(f.confidence * 100)}%</span>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    margin: 0,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {f.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
