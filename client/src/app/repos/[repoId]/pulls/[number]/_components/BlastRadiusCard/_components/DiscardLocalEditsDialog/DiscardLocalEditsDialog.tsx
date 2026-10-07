/* DiscardLocalEditsDialog — confirmation shown when a resync is refused with a
   409 `local_edits` conflict: lists the paths that would be lost and lets the
   user cancel or retry with `discard_local_edits=true`. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export function DiscardLocalEditsDialog({
  paths,
  onCancel,
  onConfirm,
}: {
  paths: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("blast.discardLocalEdits");
  return (
    <Modal
      width={480}
      title={t("title")}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button kind="danger" onClick={onConfirm}>
            {t("confirm")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "16px 24px", fontSize: 13 }}>
        <p style={{ margin: "0 0 10px" }}>{t("body")}</p>
        <ul className="mono" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {paths.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
