/* ConfigTab — name/description/type/body editor + enabled toggle + live
   token count. Save PATCHes /skills/:id; an optional "describe your change"
   input becomes change_summary (blank -> server default). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, useSkillTokenCount } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { KEBAB_HINT_PATTERN, TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const { data: tokenData, refetch: refetchTokens } = useSkillTokenCount(skill.id);
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [changeSummary, setChangeSummary] = React.useState("");

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const nameLooksKebab = name.length === 0 || KEBAB_HINT_PATTERN.test(name);

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: {
          name,
          description,
          type,
          body,
          enabled,
          ...(changeSummary.trim() ? { change_summary: changeSummary.trim() } : {}),
        },
      },
      {
        onSuccess: (data) => {
          toast.success(t("config.savedToast", { version: data.version }));
          setChangeSummary("");
        },
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
      <FormField label={t("config.name")} required hint={nameLooksKebab ? undefined : t("config.nameHint")}>
        <TextInput value={name} onChange={setName} mono />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField
        label={t("config.body")}
        hint={tokenData ? t("config.tokenCount", { tokens: tokenData.tokens }) : undefined}
      >
        {/* React's onBlur bubbles from the textarea to this wrapper, unlike
            native DOM blur — lets us "fetch on blur" without a vendor/ui
            Textarea change (out of scope for this pass). */}
        <div onBlur={() => refetchTokens()}>
          <Textarea value={body} onChange={setBody} rows={16} mono />
        </div>
      </FormField>
      <FormField label={t("config.changeSummary")}>
        <TextInput
          value={changeSummary}
          onChange={setChangeSummary}
          placeholder={t("config.changeSummaryPlaceholder")}
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
    </div>
  );
}
