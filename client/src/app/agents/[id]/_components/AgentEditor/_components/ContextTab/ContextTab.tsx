"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, Toggle, Button } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useUpdateAgent } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import { s } from "./styles";

/** Context tab — repo intelligence injection, moved here from Config. */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [repoIntel, setRepoIntel] = React.useState(agent.repo_intel);

  const save = () =>
    update.mutate(
      { id: agent.id, patch: { repo_intel: repoIntel } },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("context.title")}</h2>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label style={s.toggleRow}>
          <Toggle on={repoIntel} onChange={setRepoIntel} size={16} />
        </label>
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
