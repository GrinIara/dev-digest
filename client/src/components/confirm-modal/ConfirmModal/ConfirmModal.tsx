"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";

/** Generic destructive-action confirmation (Cancel / Confirm / X) — the shared
 *  replacement for ad hoc `window.confirm()` delete prompts across card lists. */
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = true,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      width={420}
      title={title}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "4px 20px 20px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {body}
      </div>
    </Modal>
  );
}
