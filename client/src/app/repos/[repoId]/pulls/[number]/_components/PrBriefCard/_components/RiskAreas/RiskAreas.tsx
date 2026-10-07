"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_META } from "../../constants";
import { sortRisks } from "../../helpers";
import { s } from "./styles";

/** Model text (titles, refs, explanations) is always rendered as plain text. */
export function RiskAreas({ risks }: { risks: Risk[] }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState<Set<number>>(() => new Set());
  const sorted = sortRisks(risks);

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (sorted.length === 0) return <p style={{ margin: 0, fontSize: 13 }}>{t("noRisks")}</p>;

  return (
    <section aria-label={t("riskAreas")}>
      <h3 style={s.label}>{t("riskAreas")}</h3>
      <ul style={s.list}>
        {sorted.map((risk, i) => {
          const meta = SEVERITY_META[risk.severity];
          const SevIcon = Icon[meta.icon];
          const expanded = open.has(i);
          return (
            <li key={i}>
              <div style={s.row}>
                <span role="img" aria-label={t(`severity.${risk.severity}`)} style={{ color: meta.color, display: "inline-flex" }}>
                  <SevIcon size={16} />
                </span>
                <span style={s.title}>{risk.title}</span>
                {risk.file_refs.length > 0 && <code style={s.ref}>{risk.file_refs[0]}</code>}
                <button type="button" style={s.toggle} aria-expanded={expanded} onClick={() => toggle(i)}>
                  {expanded ? t("collapse") : t("expand")}
                </button>
              </div>
              {expanded && <p style={s.explanation}>{risk.explanation}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
