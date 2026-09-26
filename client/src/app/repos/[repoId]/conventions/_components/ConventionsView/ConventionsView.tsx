"use client";

import { Button, Chip, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { FILTERS, SKELETON_CARDS } from "../../constants";
import { s } from "../../styles";
import { useConventionsView } from "./hooks/useConventionsView";

export function ConventionsView({ repoId }: { repoId: string }) {
  const {
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
    counts,
    visible,
    scanned,
    runScan,
    selectedIds,
    openSkillModal,
    closeModal,
    toggleSelectAll,
    setSelected,
    githubEvidenceUrl,
  } = useConventionsView(repoId);

  return (
    <div style={s.page}>
      {modalOpen && (
        <CreateSkillModal
          repoName={repoName}
          acceptedCount={selectedIds.length}
          draft={draft}
          onClose={closeModal}
        />
      )}

      <div style={s.headerRow}>
        <h1 style={s.heading}>
          {t("page.headingPrefix")}
          <span className="mono" style={s.repoName}>
            {repoName}
          </span>
        </h1>
        <Button
          icon="RefreshCw"
          onClick={runScan}
          loading={extract.isPending}
          disabled={extract.isPending}
        >
          {extract.isPending
            ? t("page.scanning")
            : scanned
              ? t("page.rescan")
              : t("page.runExtraction")}
        </Button>
      </div>
      <p style={s.subtitle}>{t("page.subtitle")}</p>

      {scan && (
        <p style={s.scanSummary}>
          {t("page.scanSummary", {
            sampled: scan.sampled_files.length,
            model: scan.model,
            proposed: scan.proposed,
            droppedUngrounded: scan.dropped_ungrounded,
            droppedDuplicate: scan.dropped_duplicate,
          })}
        </p>
      )}

      {scanned && (
        <div style={s.toolbar}>
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
              {t(`page.filter.${f}`)}
            </Chip>
          ))}
          <div style={s.toolbarSpacer} />
          {counts.accepted > 0 && (
            <>
              <Button kind="ghost" size="sm" icon="X" onClick={toggleSelectAll}>
                {excluded.size === 0 ? t("page.deselectAll") : t("page.selectAll")}
              </Button>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t("page.selectedCount", {
                  selected: selectedIds.length,
                  total: counts.accepted,
                })}
              </span>
            </>
          )}
          <Button
            kind="primary"
            icon="Sparkles"
            disabled={selectedIds.length === 0 || draftSkill.isPending}
            onClick={openSkillModal}
          >
            {t("page.createSkill")}
          </Button>
        </div>
      )}

      {isLoading && (
        <div style={s.list}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <Skeleton key={i} height={180} />
          ))}
        </div>
      )}

      {isError && <ErrorState title={t("page.loadError")} onRetry={() => refetch()} />}

      {!isLoading && !isError && !scanned && (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={runScan}
        />
      )}

      {!isLoading && !isError && scanned && visible.length === 0 && (
        <EmptyState
          icon="ListChecks"
          title={t("page.emptyFiltered.title")}
          body={t("page.emptyFiltered.body")}
        />
      )}

      {visible.length > 0 && (
        <>
          <p style={s.scanSummary}>
            <Icon.Check size={12} style={{ verticalAlign: "-1px", marginRight: 6 }} />
            {t("page.candidateCount", { count: visible.length })}
          </p>
          <div style={s.list}>
            {visible.map((candidate) => (
              <ConventionCard
                key={candidate.id}
                candidate={candidate}
                busy={update.isPending}
                evidenceHref={githubEvidenceUrl(
                  activeRepo?.full_name,
                  activeRepo?.default_branch,
                  candidate.evidence_path,
                  candidate.evidence_line,
                )}
                selectable={candidate.status === "accepted"}
                selected={!excluded.has(candidate.id)}
                onSelect={(on) => setSelected(candidate.id, on)}
                onStatus={(status) => update.mutate({ repoId, id: candidate.id, patch: { status } })}
                onSave={(patch) => update.mutate({ repoId, id: candidate.id, patch })}
                onDelete={() => remove.mutate({ repoId, id: candidate.id })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
