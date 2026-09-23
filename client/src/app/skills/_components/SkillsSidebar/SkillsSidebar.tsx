/* SkillsSidebar — the persistent 280px skill list on the left of the Skills
   Lab split view: header + "Add Skill" dropdown (Create / Import from file),
   a search input, then one SkillCard per skill in a single scrollable
   column. Renders on both /skills (nothing selected) and /skills/:id (one
   selected) via SkillsShell, so the list never disappears when a skill is
   opened — mirrors agents/[id]/_components/AgentsSidebar's structure, but
   also owns the loading/error/empty states and the create/import/delete
   modals that used to live in the now-removed SkillsListView. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsSidebar({
  skills,
  activeId,
  isLoading,
  isError,
  onRetry,
  usageCounts,
  onToggleSkill,
}: {
  skills: Skill[] | undefined;
  activeId: string | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  usageCounts?: Map<string, number>;
  onToggleSkill: (id: string, enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);

  return (
    <div style={s.wrap}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillModal onClose={() => setImporting(false)} />}

      <div style={s.header}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      {isLoading && (
        <div style={s.listLoading}>
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      )}
      {isError && (
        <div style={s.listState}>
          <ErrorState body={t("page.loadError")} onRetry={onRetry} />
        </div>
      )}
      {!isLoading && !isError && list.length === 0 && (
        <div style={s.listState}>
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setImporting(true)}
          />
        </div>
      )}
      {!isLoading && !isError && list.length > 0 && (
        <div style={s.list}>
          {list.map((sk) => (
            <SkillCard
              key={sk.id}
              skill={sk}
              active={sk.id === activeId}
              usedByCount={usageCounts?.get(sk.id) ?? 0}
              href={`/skills/${sk.id}?tab=config`}
              onToggle={(enabled) => onToggleSkill(sk.id, enabled)}
              onDeleted={() => {
                if (sk.id === activeId) router.push("/skills");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
