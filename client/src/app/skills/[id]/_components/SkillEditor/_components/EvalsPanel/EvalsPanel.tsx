/* EvalsPanel — the Skill detail panel's "Evals" tab body. Lists eval_cases
   for the owner, lets the user create one, run it ("Run on evals"), and see
   its eval_runs history. Stays owner-agnostic (`ownerKind: 'skill' | 'agent'`)
   because the eval API itself is; it's colocated here because it has one
   consumer today (`SkillEditor.tsx`) — the Agent Evals tab that used to be
   its second consumer was deliberately removed (`8c1329e`, 2-tab grading
   requirement). If a second consumer comes back, promote it back to
   `src/components/evals-panel/`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
  Modal,
  FormField,
  TextInput,
  Textarea,
  IconBtn,
} from "@devdigest/ui";
import type { EvalCase, EvalCaseRun, EvalOwnerKind } from "@devdigest/shared";
import {
  useEvalCases,
  useEvalCaseRuns,
  useCreateEvalCase,
  useDeleteEvalCase,
  useRunEvalCase,
} from "@/lib/hooks/eval";
import { s } from "./styles";

export function EvalsPanel({
  ownerKind,
  ownerId,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
}) {
  const t = useTranslations("eval");
  const { data: cases, isLoading, isError, refetch } = useEvalCases(ownerKind, ownerId);
  const [creating, setCreating] = React.useState(false);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <div style={s.heading}>{t("evalsTab.casesHeading")}</div>
        <Button kind="secondary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
          {t("evalsTab.newCase")}
        </Button>
      </div>

      {isLoading && <Skeleton height={80} />}
      {isError && <ErrorState onRetry={() => refetch()} />}
      {!isLoading && !isError && (cases ?? []).length === 0 && (
        <EmptyState icon="FlaskConical" title={t("evalsTab.emptyCases")} />
      )}
      {!!cases?.length && (
        <div style={s.list}>
          {cases.map((c) => (
            <EvalCaseRow key={c.id} evalCase={c} />
          ))}
        </div>
      )}

      {creating && (
        <NewEvalCaseModal ownerKind={ownerKind} ownerId={ownerId} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function EvalCaseRow({ evalCase }: { evalCase: EvalCase }) {
  const t = useTranslations("eval");
  const [expanded, setExpanded] = React.useState(false);
  const { data: runs } = useEvalCaseRuns(expanded ? evalCase.id : undefined);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const latest = runs?.[0];

  return (
    <div style={s.case}>
      <div style={s.caseHeader}>
        <div style={s.caseName} onClick={() => setExpanded((v) => !v)} role="button">
          {evalCase.name}
        </div>
        <StatusBadge run={latest} />
        <div style={s.caseActions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            loading={runCase.isPending}
            onClick={() => runCase.mutate(evalCase.id)}
          >
            {runCase.isPending ? t("evalsTab.running") : t("evalsTab.run")}
          </Button>
          <IconBtn
            icon="Trash"
            label={t("evalsTab.delete")}
            onClick={() => deleteCase.mutate(evalCase.id)}
          />
        </div>
      </div>
      {expanded && (
        <div style={s.runsList}>
          {(runs ?? []).length === 0 && <div style={s.caseMeta}>{t("evalsTab.neverRun")}</div>}
          {(runs ?? []).map((r) => (
            <div key={r.id} style={s.runRow}>
              <span>{new Date(r.ran_at).toLocaleString()}</span>
              <StatusBadge run={r} />
              {r.duration_ms != null && <span>{Math.round(r.duration_ms / 1000)}s</span>}
              {r.cost_usd != null && <span>${r.cost_usd.toFixed(4)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ run }: { run: EvalCaseRun | undefined }) {
  const t = useTranslations("eval");
  if (!run) return <Badge color="var(--text-muted)">{t("evalsTab.neverRun")}</Badge>;
  return run.pass ? (
    <Badge color="var(--ok)">{t("evalsTab.passed")}</Badge>
  ) : (
    <Badge color="var(--crit)">{t("evalsTab.failed")}</Badge>
  );
}

function NewEvalCaseModal({
  ownerKind,
  ownerId,
  onClose,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const tCommon = useTranslations("common");
  const createCase = useCreateEvalCase();
  const [name, setName] = React.useState("");
  const [diff, setDiff] = React.useState("");
  const [expectedOutput, setExpectedOutput] = React.useState("");

  const save = () => {
    let expected_output: unknown;
    if (expectedOutput.trim()) {
      try {
        expected_output = JSON.parse(expectedOutput);
      } catch {
        expected_output = undefined;
      }
    }
    createCase.mutate(
      { owner_kind: ownerKind, owner_id: ownerId, name, input_diff: diff, expected_output },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal title={t("caseEditor.newCase")} onClose={onClose} width={560}>
      <div style={{ padding: 20 }}>
        <FormField label={t("caseEditor.nameLabel")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("caseEditor.namePlaceholder")}
          />
        </FormField>
        <FormField label={t("caseEditor.inputLabel")} required>
          <Textarea
            value={diff}
            onChange={setDiff}
            rows={8}
            mono
            placeholder={t("caseEditor.diffPlaceholder")}
          />
        </FormField>
        <FormField label={t("caseEditor.expectedOutput")}>
          <Textarea value={expectedOutput} onChange={setExpectedOutput} rows={3} mono />
        </FormField>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px" }}>
        <Button kind="ghost" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button
          kind="primary"
          disabled={!name || !diff}
          loading={createCase.isPending}
          onClick={save}
        >
          {createCase.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
        </Button>
      </div>
    </Modal>
  );
}
