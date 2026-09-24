"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type FileCardProps } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useFindingAction,
  useSmartDiff,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SmartDiffGroups } from "../SmartDiffGroups";
import { SEVERITY_LINE_LABEL, DIFF_ORDER, type DiffOrder } from "./constants";
import {
  selectActiveFindings,
  findingsByFile,
  findingAnnotations,
  resolveSmartGroups,
  markedPathsFrom,
  diffTotals,
} from "./helpers";
import { s, toggleBtn } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const smart = useSmartDiff(prId);
  const action = useFindingAction();
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const active = selectActiveFindings(reviews ?? []);
  const byFile = findingsByFile(active);
  // While loading/errored, or when the smart-diff paths don't cover exactly
  // `pr.files` (e.g. right after a PR refresh), fall back to original order.
  const groups = smart.isError ? null : resolveSmartGroups(smart.data, files);
  const marked = markedPathsFrom(smart.isError ? undefined : smart.data, active);
  const totals = diffTotals(files);

  const renderCard = (f: (typeof active)[number]) => (
    <FindingCard
      f={f}
      defaultExpanded
      onAction={(a, r) => action.mutate({ findingId: f.id, action: a, reply: r, prId: prId ?? undefined })}
      pending={action.isPending && action.variables?.findingId === f.id}
      repoFullName={repoFullName}
      headSha={headSha}
    />
  );

  const fileProps = (f: PrFile): Omit<Partial<FileCardProps>, "file" | "commenting"> => ({
    marked: marked.has(f.path),
    annotations: findingAnnotations(
      byFile.get(f.path) ?? [],
      renderCard,
      (x) => t(`smartDiff.${SEVERITY_LINE_LABEL[x.severity as Severity]}`),
    ),
  });

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.header}>
            <span style={s.summary}>
              {t("smartDiff.summary", { files: filesCount, additions: totals.additions, deletions: totals.deletions })}
            </span>
            <div style={s.toggle}>
              {DIFF_ORDER.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={order === o}
                  style={toggleBtn(order === o)}
                  onClick={() => setOrder(o)}
                >
                  {o === "smart" ? t("smartDiff.smartOrder") : t("smartDiff.originalOrder")}
                </button>
              ))}
            </div>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        {t("smartDiff.reviewerOrdered")}
      </SectionLabel>
      {order === "smart" && groups ? (
        <SmartDiffGroups groups={groups} commenting={commenting} fileProps={fileProps} />
      ) : (
        <DiffViewer files={files} commenting={commenting} fileProps={fileProps} />
      )}
    </section>
  );
}
