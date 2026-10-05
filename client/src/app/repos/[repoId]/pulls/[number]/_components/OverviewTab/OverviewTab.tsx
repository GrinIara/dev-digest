"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard } from "../PrBriefCard";
import { usePrBrief } from "@/lib/hooks/brief";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
  onOpenFile?: (path: string) => void;
}

export function OverviewTab({ prId, prBody, repoId, repoFullName, headSha, onOpenFile }: OverviewTabProps) {
  const { data: briefData } = usePrBrief(prId);
  return (
    <>
      {prId && <PrBriefCard prId={prId} onOpenFile={onOpenFile} />}

      {prId && (
        <div style={s.cardsRow}>
          <div style={s.intentSlot}>
            <IntentCard prId={prId} hideRiskAreas={!!briefData?.brief} />
          </div>
          <div style={s.blastSlot}>
            <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
          </div>
        </div>
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
