/* ImportSkillModal — "from file" import flow only (paste .md or upload a
   .md/.zip). Import-from-URL and community search are explicitly out of
   scope for this pass (no backend support) — this modal never renders those
   tabs, it only consumes drawer.title/subtitle, drawer.tabs.file and the
   file.* copy. Two steps: parse-only preview (POST /skills/import), then a
   confirm step that actually creates the skill (POST /skills, source:
   'extracted') once the user has seen the trust warning. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, SelectInput, Textarea, Markdown } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useImportSkillDraft, type SkillImportDraft } from "@/lib/hooks/skills";
import { arrayBufferToBase64, isZipFile } from "./helpers";
import { DEFAULT_TYPE, MODAL_WIDTH, TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const importDraft = useImportSkillDraft();
  const createSkill = useCreateSkill();

  const [content, setContent] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [draft, setDraft] = React.useState<SkillImportDraft | null>(null);
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const parse = async () => {
    try {
      const result = file
        ? isZipFile(file)
          ? await importDraft.mutateAsync({ kind: "zip", content_base64: arrayBufferToBase64(await file.arrayBuffer()) })
          : await importDraft.mutateAsync({ kind: "markdown", content: await file.text() })
        : await importDraft.mutateAsync({ kind: "markdown", content });
      setDraft(result);
    } catch {
      // surfaced below via importDraft.isError/error
    }
  };

  const confirm = () => {
    if (!draft) return;
    createSkill.mutate(
      { name: draft.name, description: draft.description, type, body: draft.body, source: "extracted" },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}?tab=config`);
        },
      },
    );
  };

  const canParse = !importDraft.isPending && (!!file || content.trim().length > 0);

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        draft ? (
          <div style={s.footer}>
            <Button kind="ghost" onClick={() => setDraft(null)}>
              {t("create.cancel")}
            </Button>
            <Button kind="primary" icon="Plus" onClick={confirm} disabled={createSkill.isPending}>
              {createSkill.isPending ? t("file.confirming") : t("file.confirm")}
            </Button>
          </div>
        ) : (
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("create.cancel")}
            </Button>
            <Button kind="primary" icon="Upload" onClick={parse} disabled={!canParse}>
              {importDraft.isPending ? t("file.importing") : t("file.import")}
            </Button>
          </div>
        )
      }
    >
      <div style={s.body}>
        {!draft && (
          <>
            <div style={s.sectionLabel}>{t("drawer.tabs.file")}</div>
            <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
              <Textarea
                value={content}
                onChange={(v) => {
                  setContent(v);
                  if (v) setFile(null);
                }}
                rows={10}
                mono
                placeholder={t("file.bodyPlaceholder")}
              />
            </FormField>
            <div style={s.orDivider}>—</div>
            <FormField label={t("file.orUpload")}>
              <input
                type="file"
                accept=".md,.zip"
                style={s.fileInput}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) setContent("");
                }}
              />
            </FormField>
            {importDraft.isError && (
              <div role="alert" style={{ color: "var(--crit)", fontSize: 13 }}>
                {t("drawer.importFailed")}
                {importDraft.error instanceof ApiError ? `: ${importDraft.error.message}` : ""}
              </div>
            )}
          </>
        )}

        {draft && (
          <>
            <div style={s.trustWarning}>{t("drawer.trustWarning")}</div>
            <FormField label={t("create.fields.name")}>
              <div className="mono" style={{ fontSize: 14 }}>
                {draft.name}
              </div>
            </FormField>
            <FormField label={t("create.fields.description")}>
              <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{draft.description}</div>
            </FormField>
            <FormField label={t("file.typeLabel")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
            <FormField label={t("create.fields.body")}>
              <div style={s.previewBody}>
                <Markdown>{draft.body}</Markdown>
              </div>
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
