"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}

export function OverviewTab({ prId, prBody, repoId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {prId && (
        <div style={s.cardsRow}>
          <IntentCard prId={prId} />
          <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
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
