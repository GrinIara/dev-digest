/* IntentCallSection — the intent classifier's own (cheap) LLM call: status,
   provider/model, duration, tokens/cost, confidence and the sources it was
   derived from. Extracted from TraceBody (T8) to keep that file under the
   ~200-line guideline; kept separate from the agent's own Stats section so
   the classifier's tokens/cost are never mistaken for the agent's. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { IntentCallTrace } from "@devdigest/shared";
import { formatCost, formatSeconds, formatTokens } from "../../helpers";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";
import { Row } from "../atoms";

export function IntentCallSection({ call }: { call: IntentCallTrace }) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="Gauge"
      title={t("trace.intentCall.title")}
      right={<Badge color="var(--text-muted)">{call.status}</Badge>}
    >
      <div style={s.configList}>
        <Row label={t("trace.intentCall.status")}>
          <span>{call.status}</span>
        </Row>
        <Row label={t("trace.intentCall.model")}>
          <span className="mono">
            {call.provider ?? "—"}/{call.model ?? "—"}
          </span>
        </Row>
        <Row label={t("trace.intentCall.duration")}>
          <span>{formatSeconds(call.duration_ms)}</span>
        </Row>
        <Row label={t("trace.intentCall.tokens")}>
          <span>{formatTokens(call.tokens_in, call.tokens_out)}</span>
        </Row>
        <Row label={t("trace.intentCall.cost")}>
          <span>{formatCost(call.cost_usd)}</span>
        </Row>
        <Row label={t("trace.intentCall.approxPromptTokens")}>
          <span>{call.approx_prompt_tokens}</span>
        </Row>
        <Row label={t("trace.intentCall.confidence")}>
          <span>{call.confidence ?? "—"}</span>
        </Row>
        {call.error != null && (
          <Row label={t("trace.intentCall.error")}>
            <span style={{ color: "var(--crit)" }}>{call.error}</span>
          </Row>
        )}
      </div>
      {call.prompt_components.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span style={s.rowLabel}>{t("trace.intentCall.promptComponents")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {call.prompt_components.map((c) => (
              <span key={c.name} className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {c.name} · ~{c.approx_tokens}
              </span>
            ))}
          </div>
        </div>
      )}
      {call.sources.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span style={s.rowLabel}>{t("trace.intentCall.sources")}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {call.sources.map((src, i) => (
              <span key={i} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {src.kind} {src.ref ?? ""} · {src.status}
                {src.detail ? ` · ${src.detail}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </TraceSection>
  );
}
