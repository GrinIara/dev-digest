/* IntentCard — R5: shows the derived PR intent (summary, in/out-of-scope,
   risk areas, confidence, source statuses) above the Live review / Timeline /
   Review runs sections on the Findings tab. Renders empty/loading/error
   states and lets the user (re-)trigger classification. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Chip, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useReclassifyIntent } from "../../../../../../../lib/hooks/reviews";
import { missingSources, sourceLabel } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("intent");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const reclassify = useReclassifyIntent(prId);

  if (isLoading) {
    return (
      <Card style={s.card}>
        <Skeleton width={120} height={14} />
        <div style={{ marginTop: 14 }}>
          <Skeleton height={12} />
          <Skeleton height={12} style={{ marginTop: 8, width: "70%" }} />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card style={s.card}>
        <ErrorState title={t("errorTitle")} body={t("errorBody")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const intent = data?.intent ?? null;
  const stale = data?.stale ?? false;

  if (!intent) {
    return (
      <Card style={s.card}>
        <EmptyState
          icon="Target"
          title={t("notDerivedYet")}
          body={t("notDerivedBody")}
          cta={t("classifyNow")}
          onCta={() => reclassify.mutate()}
          ctaLoading={reclassify.isPending}
        />
      </Card>
    );
  }

  const missing = missingSources(intent.sources);
  const descriptionEmpty = intent.sources.some((src) => src.kind === "description" && src.status === "empty");

  return (
    <Card style={s.card}>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerActions}>
            {intent.confidence === "high" ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)">
                {t("confidence.high")}
              </Badge>
            ) : (
              <Badge color="var(--warn)" bg="var(--warn-bg)">
                {t("confidence.low")}
              </Badge>
            )}
            {stale && (
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                {t("stale")}
              </Badge>
            )}
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={reclassify.isPending}
              onClick={() => reclassify.mutate()}
            >
              {t("reclassify")}
            </Button>
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      <blockquote style={s.summary}>{intent.summary}</blockquote>

      <div style={s.columns}>
        <div>
          <div style={s.columnLabel}>{t("inScope")}</div>
          {intent.in_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.in_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <span style={s.emptyListItem}>{t("noItems")}</span>
          )}
        </div>
        <div>
          <div style={s.columnLabel}>{t("outOfScope")}</div>
          {intent.out_of_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <span style={s.emptyListItem}>{t("noItems")}</span>
          )}
        </div>
      </div>

      {intent.risk_areas.length > 0 && (
        <div style={s.chipRow}>
          <span style={s.columnLabel}>{t("riskAreas")}</span>
          {intent.risk_areas.map((area, i) => (
            <Chip key={i}>{area}</Chip>
          ))}
        </div>
      )}

      <div style={s.sourcesFooter}>
        {intent.sources.map((src, i) => (
          <Chip key={i}>{sourceLabel(src)}</Chip>
        ))}
      </div>

      {missing.length > 0 && (
        <div role="status" style={s.warning}>
          {t("missingContext", { refs: missing.map((m) => m.ref ?? m.kind).join(", ") })}
        </div>
      )}
      {descriptionEmpty && <div style={s.warning}>{t("noDescription")}</div>}
    </Card>
  );
}
