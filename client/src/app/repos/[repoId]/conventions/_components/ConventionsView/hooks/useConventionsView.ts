"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionExtractResult, ConventionSkillDraft } from "@devdigest/shared";
import {
  useConventionSkillDraft,
  useConventions,
  useDeleteConvention,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import type { ConventionFilter } from "../../../constants";
import { countByStatus, filterCandidates, githubEvidenceUrl } from "../../../helpers";

/** All state, derived values and handlers for the Conventions board — kept
 *  out of `page.tsx` so the route stays a thin composition shell. */
export function useConventionsView(repoId: string) {
  const t = useTranslations("conventions");
  const { activeRepo } = useActiveRepo();
  const toast = useToast();

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();
  const remove = useDeleteConvention();
  const draftSkill = useConventionSkillDraft();

  const [filter, setFilter] = React.useState<ConventionFilter>("pending");
  const [scan, setScan] = React.useState<ConventionExtractResult | null>(null);
  const [draft, setDraft] = React.useState<ConventionSkillDraft | undefined>();
  const [modalOpen, setModalOpen] = React.useState(false);
  /**
   * Which accepted candidates go into the NEXT skill. Empty means "all of them",
   * so the common case needs no clicks; deselecting is how you split one board
   * into several focused skills.
   */
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const all = candidates ?? [];
  const counts = countByStatus(all);
  const visible = filterCandidates(all, filter);
  const scanned = all.length > 0;

  const runScan = async () => {
    try {
      const result = await extract.mutateAsync(repoId);
      setScan(result);
      // Land on the state that has something in it: a first scan produces only
      // pending rows, a re-scan may produce none at all.
      setFilter(result.candidates.some((c) => c.status === "pending") ? "pending" : "all");
    } catch {
      toast.error(t("page.extractionFailed"));
    }
  };

  const acceptedIds = all.filter((c) => c.status === "accepted").map((c) => c.id);
  const selectedIds = acceptedIds.filter((id) => !excluded.has(id));

  const openSkillModal = async () => {
    setDraft(undefined);
    setModalOpen(true);
    try {
      setDraft(await draftSkill.mutateAsync({ repoId, conventionIds: selectedIds }));
    } catch {
      setModalOpen(false);
      toast.error(t("modal.failed"));
    }
  };

  const closeModal = () => setModalOpen(false);

  const toggleSelectAll = () => setExcluded(excluded.size === 0 ? new Set(acceptedIds) : new Set());

  const setSelected = (id: string, on: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  return {
    t,
    activeRepo,
    isLoading,
    isError,
    refetch,
    extract,
    update,
    remove,
    draftSkill,
    filter,
    setFilter,
    scan,
    draft,
    modalOpen,
    excluded,
    repoName,
    all,
    counts,
    visible,
    scanned,
    runScan,
    acceptedIds,
    selectedIds,
    openSkillModal,
    closeModal,
    toggleSelectAll,
    setSelected,
    githubEvidenceUrl,
  };
}

export type ConventionsViewModel = ReturnType<typeof useConventionsView>;
