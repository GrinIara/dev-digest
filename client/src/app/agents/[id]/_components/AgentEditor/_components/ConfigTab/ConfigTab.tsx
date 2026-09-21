"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, SearchableSelect, Textarea, Toggle, Button, Icon } from "@devdigest/ui";
import type { Agent, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent, useAllModels } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import { modelLabel } from "../../../../../../../lib/model-label";
import { OUTPUT_SCHEMA_VALUE, STRATEGY_VALUES } from "./constants";
import { s } from "./styles";

/** Composite SearchableSelect value — model ids alone aren't unique once the
   list spans every provider, so the picker's internal `value` is provider+id
   and gets split back into the two real fields on selection/save. */
const modelKey = (provider: string, id: string) => `${provider}::${id}`;

/** Config tab — name/description/cross-provider model/system-prompt + enabled toggle.
   `repo_intel` moved to the Context tab, `ci_fail_on` moved to the CI tab. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [name, setName] = React.useState(agent.name);
  const [description, setDescription] = React.useState(agent.description);
  const [provider, setProvider] = React.useState<Provider>(agent.provider);
  const [model, setModel] = React.useState(agent.model);
  const [systemPrompt, setSystemPrompt] = React.useState(agent.system_prompt);
  const [strategy, setStrategy] = React.useState<ReviewStrategy>(agent.strategy);
  const [enabled, setEnabled] = React.useState(agent.enabled);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const { data: allModels } = useAllModels();
  const selectedKey = modelKey(provider, model);
  // Every option is provider-prefixed (modelLabel) so cross-provider id
  // collisions stay disambiguated; the composite key is UI-internal only.
  const modelOptions = (allModels ?? []).map((m) => ({
    value: modelKey(m.provider, m.id),
    label: modelLabel(m),
  }));
  const hasModel = modelOptions.some((o) => o.value === selectedKey);
  if (!hasModel) modelOptions.unshift({ value: selectedKey, label: modelLabel({ id: model, provider }) });
  // Empty list after load = every provider key missing/invalid (listModels
  // degraded each to []) — guide the user instead of showing an empty dropdown.
  const noModels = allModels !== undefined && allModels.length === 0;

  const onModelChange = (key: string) => {
    const found = (allModels ?? []).find((m: ModelInfo) => modelKey(m.provider, m.id) === key);
    if (found) {
      setProvider(found.provider);
      setModel(found.id);
    }
  };

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));

  const save = () =>
    update.mutate(
      {
        id: agent.id,
        patch: {
          name,
          description,
          provider,
          model,
          system_prompt: systemPrompt,
          strategy,
          enabled,
        },
      },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
      >
        <SearchableSelect
          value={selectedKey}
          onChange={onModelChange}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
        />
      </FormField>
      <FormField label={t("config.systemPrompt")} hint={t("config.systemPromptHint")}>
        <Textarea value={systemPrompt} onChange={setSystemPrompt} rows={8} mono />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectInput value={OUTPUT_SCHEMA_VALUE} options={[OUTPUT_SCHEMA_VALUE]} />
      </FormField>

      <button type="button" style={s.advancedToggle} onClick={() => setAdvancedOpen((v) => !v)}>
        <Icon.ChevronRight size={14} style={advancedOpen ? s.advancedChevronOpen : undefined} />
        {t("config.advanced")}
      </button>
      {advancedOpen && (
        <div style={s.advancedBody}>
          <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
            <SelectInput
              value={strategy}
              onChange={(v) => setStrategy(v as ReviewStrategy)}
              options={strategyOptions}
            />
          </FormField>
        </div>
      )}

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
