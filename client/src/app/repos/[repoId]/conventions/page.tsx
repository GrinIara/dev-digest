/* Route: /repos/:repoId/conventions — the Conventions Extractor.
   Scan the cloned repo for house-rules, triage the candidates, and merge the
   accepted ones into a skill. Every candidate on this page has already passed
   the server's evidence gate, so the snippets shown are real repo bytes. */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const repoNotFound = useRepoNotFound(repoId);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <ConventionsView repoId={repoId} />
    </AppShell>
  );
}
