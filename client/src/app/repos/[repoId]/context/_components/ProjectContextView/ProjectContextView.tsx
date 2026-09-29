"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { NOT_CLONED_CODE } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useContextDocs } from "@/lib/hooks";
import { SKELETON_ROWS } from "../../constants";
import { firstDocPath, formatRootsForEmptyState } from "../../helpers";
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

  // Open the first document once the list arrives, so the page never starts blank.
  useEffect(() => {
    if (selected === null && data && data.docs.length > 0) setSelected(firstDocPath(data.docs));
  }, [data, selected]);

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
  const hasDocs = !!data && data.docs.length > 0;

  let tree: React.ReactNode = null;
  let main: React.ReactNode;
  if (isLoading) {
    tree = (
      <div aria-busy="true" style={s.skeletonCol}>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} height={26} />
        ))}
      </div>
    );
    main = null;
  } else if (notCloned) {
    main = (
      <div style={s.centered}>
        <p style={s.message}>{t("notCloned")}</p>
      </div>
    );
  } else if (error || !data) {
    main = (
      <div style={s.centered}>
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
      </div>
    );
  } else if (!hasDocs) {
    main = (
      <div style={s.centered}>
        <EmptyState
          icon="FileText"
          title={t("emptyTitle")}
          body={t("emptyBody", { roots: formatRootsForEmptyState(data.roots) })}
        />
      </div>
    );
  } else {
    tree = <DocTree docs={data.docs} selectedPath={selected} onSelect={(path) => guard(() => setSelected(path))} />;
    main = <DocPreview key={selected} repoId={repoId} path={selected} onDirtyChange={setDirty} guard={guard} />;
  }

  return (
    <div style={s.page}>
      <aside style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <h1 style={s.eyebrow}>{t("title")}</h1>
          {data && <div style={s.roots}>{data.roots.join(" · ")}</div>}
        </div>
        <div style={s.toolbar}>
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            aria-label={t("refresh")}
            title={t("refresh")}
            loading={isFetching && !isLoading}
            onClick={() => refetch()}
          />
        </div>
        <div style={s.treeScroll}>{tree}</div>
        {hasDocs && (
          <div style={s.sidebarFooter}>
            <span aria-hidden="true" style={s.footerDot} />
            <span>{t("footer", { count: data.docs.length, tokens: data.total_tokens })}</span>
          </div>
        )}
      </aside>
      <section style={s.main}>{main}</section>
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
