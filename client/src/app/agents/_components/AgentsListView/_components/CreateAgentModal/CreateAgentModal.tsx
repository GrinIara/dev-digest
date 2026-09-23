"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SearchableSelect, Textarea } from "@devdigest/ui";
import type { ModelInfo, Provider } from "@devdigest/shared";
import { useCreateAgent, useAllModels } from "../../../../../../lib/hooks/agents";
import { modelLabel } from "../../../../../../lib/model-label";
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/** Composite SearchableSelect value — mirrors ConfigTab's cross-provider
   picker: model ids alone aren't unique once the list spans every provider. */
const modelKey = (provider: string, id: string) => `${provider}::${id}`;

/** Create-agent modal — name/description/cross-provider model/system-prompt. */
export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const create = useCreateAgent();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>(DEFAULT_PROVIDER);
  const [model, setModel] = React.useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = React.useState(t("create.defaultSystemPrompt"));

  const { data: allModels } = useAllModels();
  const selectedKey = modelKey(provider, model);
  const modelOptions = (allModels ?? []).map((m) => ({
    value: modelKey(m.provider, m.id),
    label: modelLabel(m),
  }));
  const hasModel = modelOptions.some((o) => o.value === selectedKey);
  if (!hasModel) modelOptions.unshift({ value: selectedKey, label: modelLabel({ id: model, provider }) });
  const noModels = allModels !== undefined && allModels.length === 0;

  const onModelChange = (key: string) => {
    const found = (allModels ?? []).find((m: ModelInfo) => modelKey(m.provider, m.id) === key);
    if (found) {
      setProvider(found.provider);
      setModel(found.id);
    }
  };

  const submit = async () => {
    const agent = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description,
      provider,
      model,
      system_prompt: systemPrompt,
    });
    onClose();
    router.push(`/agents/${agent.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("create.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField
          label={t("create.fields.model")}
          hint={noModels ? t("config.modelEmptyHint", { provider }) : undefined}
        >
          <SearchableSelect
            value={selectedKey}
            onChange={onModelChange}
            options={modelOptions}
            placeholder={t("config.modelSearch")}
          />
        </FormField>
        <FormField label={t("create.fields.systemPrompt")}>
          <Textarea value={systemPrompt} onChange={setSystemPrompt} rows={6} mono />
        </FormField>
      </div>
    </Modal>
  );
}
