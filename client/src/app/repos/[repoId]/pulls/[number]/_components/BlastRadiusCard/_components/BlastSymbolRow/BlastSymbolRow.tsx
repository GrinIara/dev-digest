/* BlastSymbolRow — one changed symbol's downstream impact: a collapsible
   header + caller file:line links, then endpoint (globe) and separate cron
   (clock, amber) chips (R6, R11). The header is a real `<button>` so the
   expand/collapse state is keyboard-operable and announced to screen readers
   (`aria-expanded`).

   Renders its own `<a>` for the caller link instead of `@devdigest/ui`'s
   `MonoLink` — `MonoLink` has no `aria-label` passthrough (it only accepts
   `children`/`onClick`/`href`), and the accessible name here must be the
   `callerLinkLabel` translation, not the raw `file:line` text (R7's exact
   link + a11y label). Editing `MonoLink` is out of this task's owned paths.
   Its hover styling (accent colour + underline) and `stopPropagation` click
   handling mirror `MonoLink` so a caller link behaves the same as any other
   mono link in the app, including not toggling this row's collapse state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { BlastCaller, DownstreamImpact } from "@devdigest/shared";
import { displayName } from "../../helpers";
import { s } from "./styles";

interface BlastSymbolRowProps {
  impact: DownstreamImpact;
  kind: string | null;
  hrefFor: (c: BlastCaller) => string | null;
  open: boolean;
  onToggle: () => void;
}

interface CallerLinkProps {
  href: string;
  label: string;
  ariaLabel: string;
}

function CallerLink({ href, label, ariaLabel }: CallerLinkProps) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <a
      className="mono"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={s.callerLink(hovered)}
    >
      {label}
    </a>
  );
}

export function BlastSymbolRow({ impact, kind, hrefFor, open, onToggle }: BlastSymbolRowProps) {
  const t = useTranslations("blast");
  const hasChips = impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0;
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t("toggleSymbol", { symbol: impact.symbol })}
        onClick={onToggle}
        style={s.header}
      >
        <span style={s.headerLeft}>
          <Chevron size={14} style={s.chevron} />
          <span className="mono" style={s.symbolName}>
            {displayName(impact.symbol, kind)}
          </span>
        </span>
        <span style={s.callerCount}>{t("callerCount", { count: impact.callers.length })}</span>
      </button>

      {open && (
        <>
          <div style={s.callersList}>
            {impact.callers.map((c) => {
              const href = hrefFor(c);
              const label = `${c.file}:${c.line}`;
              // Unique within the group: no two callers share the same
              // file+line+name (a caller is one call-site reference).
              const key = `${c.file}:${c.line}:${c.name}`;
              return (
                <div key={key} style={s.callerRow}>
                  <span style={s.callerArrow}>↳</span>
                  {href ? (
                    <CallerLink
                      href={href}
                      label={label}
                      ariaLabel={t("callerLinkLabel", { file: c.file, line: c.line })}
                    />
                  ) : (
                    <span className="mono" style={s.callerLinkStatic}>
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {hasChips && (
            <div style={s.chipsRow}>
              {impact.endpoints_affected.map((e) => (
                <Badge key={e} icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                  {e}
                </Badge>
              ))}
              {impact.crons_affected.map((c) => (
                <Badge key={c} icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
