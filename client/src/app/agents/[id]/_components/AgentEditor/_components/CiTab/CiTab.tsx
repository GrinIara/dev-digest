"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, Button, EmptyState } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import { CI_FAIL_ON_VALUES } from "./constants";
import { s } from "./styles";

/**
 * CI tab — the CI gate policy, moved here from Config, plus a read-only recent
 * CI-runs list. No hook/endpoint anywhere exposes per-agent run history filtered
 * by `source='ci'` today (every existing runs hook — `usePrRuns`/`usePrActiveRuns`
 * in `lib/hooks/reviews.ts` — is PR-scoped, not agent-scoped); rather than invent
 * a new backend route for this pass, this renders an honest empty state.
 */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [ciFailOn, setCiFailOn] = React.useState<CiFailOn>(agent.ci_fail_on);

  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  const save = () =>
    update.mutate(
      { id: agent.id, patch: { ci_fail_on: ciFailOn } },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("ci.title")}</h2>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectInput
          value={ciFailOn}
          onChange={(v) => setCiFailOn(v as CiFailOn)}
          options={ciFailOnOptions}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>

      <h3 style={s.h3}>{t("ci.runsHeading")}</h3>
      <EmptyState icon="GitBranch" title={t("ci.emptyTitle")} body={t("ci.emptyBody")} />
    </div>
  );
}
