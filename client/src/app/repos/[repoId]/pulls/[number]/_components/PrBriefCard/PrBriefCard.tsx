/* PrBriefCard — the "PR Brief" block on the Overview tab: empty / loading /
   success states, Risk areas, Review focus, provenance, regenerate. All data
   goes through hooks; model text is rendered as plain text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { usePullDetail } from "@/lib/hooks/core";
import { VerdictBanner } from "../VerdictBanner";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { BriefMeta } from "./_components/BriefMeta";
import { RefreshControl } from "./_components/RefreshControl";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string;
  onOpenFile?: (path: string) => void;
}

export function PrBriefCard({ prId, onOpenFile }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const { data: pr } = usePullDetail(prId);
  const { data: reviews } = usePrReviews(prId);

  const changedPaths = React.useMemo(() => new Set((pr?.files ?? []).map((f) => f.path)), [pr?.files]);

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

  const brief = data?.brief ?? null;
  const latest = brief ? (reviews ?? []).find((r) => r.verdict !== null) : undefined;
  const run = () => generate.mutate();
  const status = generate.isError ? t("failed") : generate.isSuccess ? t("ready") : "";

  return (
    <Card style={s.card}>
      <div style={s.header}>
        <SectionLabel icon="Sparkles">{t("title")}</SectionLabel>
        <span style={s.spacer} />
        {brief ? (
          <RefreshControl loading={generate.isPending} onClick={run} />
        ) : (
          <Button kind="primary" size="sm" icon="Sparkles" loading={generate.isPending} onClick={run}>
            {generate.isPending ? t("generating") : t("generate")}
          </Button>
        )}
      </div>

      <div role="status" aria-live="polite" style={s.srOnly}>
        {status}
      </div>

      {generate.isError && (
        <div role="alert" style={s.error}>
          <span>{generate.error instanceof Error ? generate.error.message : t("failed")}</span>
          <Button kind="secondary" size="sm" onClick={run}>
            {t("retry")}
          </Button>
        </div>
      )}

      {brief && (
        <>
          {latest?.verdict && (
            <div style={s.banner}>
              <VerdictBanner
                verdict={latest.verdict as Verdict}
                summary={latest.summary}
                score={latest.score}
                findingsCount={latest.findings.length}
                blockers={latest.findings.filter((f) => f.severity === "CRITICAL").length}
                agentName={latest.agent_name}
              />
            </div>
          )}
          <p style={s.summary}>{brief.summary}</p>
          <RiskAreas risks={brief.risks.risks} />
          <ReviewFocus items={brief.review_focus} changedPaths={changedPaths} onOpenFile={onOpenFile} />
          <BriefMeta brief={brief} stale={data?.stale ?? false} />
        </>
      )}
    </Card>
  );
}
