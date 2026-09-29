/* Route: /repos/:repoId/context — Project Context: browse the repo's Markdown
   docs (specs/, docs/, insights/, README.md) that agents can be given as context. */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  const t = useTranslations("context.page");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const repoNotFound = useRepoNotFound(repoId);

  const crumb = [{ label: t("title") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <ProjectContextView repoId={repoId} />
    </AppShell>
  );
}
