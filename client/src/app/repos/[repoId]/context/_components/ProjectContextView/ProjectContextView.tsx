"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { NOT_CLONED_CODE } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useContextDocs } from "@/lib/hooks";
import { SKELETON_ROWS } from "../../constants";
import { formatRootsForEmptyState } from "../../helpers";
import { s } from "../../styles";
import { DocPreview } from "../DocPreview";
import { DocTree } from "../DocTree";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context.page");
  const [selected, setSelected] = useState<string | null>(null);
  const tEditor = useTranslations("context.editor");
  const { data, isLoading, error, refetch, isFetching } = useContextDocs(repoId);
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Run `proceed` now, or park it behind the discard confirmation while edits are unsaved.
  const guard = useCallback(
    (proceed: () => void) => {
      if (dirty) setPendingAction(() => proceed);
      else proceed();
    },
    [dirty],
  );

  // Native browser prompt when leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const confirmDiscard = () => {
    const action = pendingAction;
    setPendingAction(null);
    action?.();
  };

  const notCloned =
    error instanceof ApiError && error.status === 409 && error.code === NOT_CLONED_CODE;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div aria-busy="true" style={s.skeletonCol}>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} height={32} />
        ))}
      </div>
    );
  } else if (notCloned) {
    body = <p style={s.message}>{t("notCloned")}</p>;
  } else if (error || !data) {
    body = <ErrorState title={t("loadError")} onRetry={() => refetch()} />;
  } else if (data.docs.length === 0) {
    body = (
      <EmptyState
        icon="FileText"
        title={t("emptyTitle")}
        body={t("emptyBody", { roots: formatRootsForEmptyState(data.roots) })}
      />
    );
  } else {
    body = (
      <>
        <div style={s.layout}>
          <div style={s.panel}>
            <DocTree docs={data.docs} selectedPath={selected} onSelect={(path) => guard(() => setSelected(path))} />
          </div>
          <div style={s.panel}>
            <DocPreview key={selected} repoId={repoId} path={selected} onDirtyChange={setDirty} guard={guard} />
          </div>
        </div>
        <p style={s.footer}>{t("footer", { count: data.docs.length, tokens: data.total_tokens })}</p>
      </>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <h1 style={s.heading}>{t("title")}</h1>
        <Button icon="RefreshCw" onClick={() => refetch()} disabled={isFetching}>
          {t("refresh")}
        </Button>
      </div>
      {body}
      {pendingAction && (
        <Modal
          width={420}
          title={tEditor("discardConfirm")}
          onClose={() => setPendingAction(null)}
          footer={
            <div style={s.dialogActions}>
              <Button kind="secondary" onClick={() => setPendingAction(null)}>
                {tEditor("cancel")}
              </Button>
              <Button kind="danger" onClick={confirmDiscard}>
                {tEditor("discard")}
              </Button>
            </div>
          }
        >
          <p style={s.dialogBody}>{tEditor("discardBody")}</p>
        </Modal>
      )}
    </div>
  );
}
