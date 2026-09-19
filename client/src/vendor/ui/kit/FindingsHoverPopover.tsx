"use client";

/* FindingsHoverPopover — read-only floating preview shown on hover over a
   cluster of severity icons (PR list's FINDINGS column, PR detail's Timeline
   run tiles). No actions here by design — Accept/Reject only exist on the
   PR detail page's Review-runs accordion (FindingCard).

   Portaled to document.body (fixed positioning, computed from the trigger's
   bounding rect) rather than a nested position:absolute panel — both call
   sites live inside `overflow: hidden` ancestors (the PR list's rounded
   table card, the Review-run accordion's rounded card), which would clip an
   inline absolute panel. A body-level portal always renders above the page
   regardless of any ancestor's overflow/stacking context. */
import React from "react";
import { createPortal } from "react-dom";
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

/** Grace period before closing, so moving the cursor from the trigger into
 *  the popover itself (crossing the small gap between them) doesn't flicker
 *  it shut. */
const CLOSE_DELAY_MS = 100;

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
  const [coords, setCoords] = React.useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const handleEnter = () => {
    cancelClose();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords(
        align === "right"
          ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 6, left: rect.left },
      );
    }
    setOpen(true);
  };

  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  if (findings.length === 0) return <>{trigger}</>;

  return (
    <>
      <div
        ref={triggerRef}
        style={{ display: "inline-block" }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {trigger}
      </div>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={handleLeave}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              right: coords.right,
              width: 380,
              maxHeight: 420,
              overflowY: "auto",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 12,
              zIndex: 1000,
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
          </div>,
          document.body,
        )}
    </>
  );
}
