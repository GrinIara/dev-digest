"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Checkbox, Badge, Skeleton, ErrorState, Icon } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { api } from "../../../../../../../lib/api";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { s } from "./styles";

/**
 * Skills tab — every workspace skill, checkbox = bound to this agent, drag to
 * reorder. This is a deliberately tiny, colocated read of `GET /skills` (not
 * the shared `lib/hooks/skills.ts` file, which the Skills Lab work owns
 * concurrently) — a few duplicated lines here is the right tradeoff for safe
 * parallel work on that file.
 */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const {
    data: skills,
    isLoading: skillsLoading,
    isError: skillsError,
    refetch: refetchSkills,
  } = useQuery({
    queryKey: ["skills-for-agent-editor"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
  const { data: links, isLoading: linksLoading } = useAgentSkills(agent.id);
  const setAgentSkills = useSetAgentSkills();

  // Display order of every skill's id (bound skills first, in their bound
  // order, then the rest) + the set of currently-bound ids. Derived once from
  // the two queries, then owned locally so drag/checkbox edits feel instant.
  const [order, setOrder] = React.useState<string[] | null>(null);
  const [bound, setBound] = React.useState<Set<string> | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (order !== null || !skills || !links) return;
    const boundIds = [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
    const boundSet = new Set(boundIds);
    const unboundIds = skills.filter((sk) => !boundSet.has(sk.id)).map((sk) => sk.id);
    setOrder([...boundIds, ...unboundIds]);
    setBound(boundSet);
  }, [skills, links, order]);

  const skillsById = React.useMemo(() => new Map((skills ?? []).map((sk) => [sk.id, sk])), [skills]);

  const commit = (nextOrder: string[], nextBound: Set<string>) => {
    setOrder(nextOrder);
    setBound(nextBound);
    setAgentSkills.mutate({ id: agent.id, skillIds: nextOrder.filter((id) => nextBound.has(id)) });
  };

  const toggle = (id: string) => {
    if (!order || !bound) return;
    const next = new Set(bound);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commit(order, next);
  };

  const onDrop = (targetId: string) => {
    if (!order || !bound || !dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setDragId(null);
    commit(next, bound);
  };

  if (skillsLoading || linksLoading || order === null || bound === null) {
    return <Skeleton height={200} />;
  }
  if (skillsError) {
    return <ErrorState onRetry={() => refetchSkills()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { bound: bound.size, total: order.length })}</span>
      </div>
      <div style={s.caption}>{t("skills.orderHint")}</div>
      <div style={s.list}>
        {order.map((id) => {
          const skill = skillsById.get(id);
          if (!skill) return null;
          return (
            <div
              key={id}
              draggable
              onDragStart={() => setDragId(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(id)}
              style={dragId === id ? { ...s.row, ...s.rowDragging } : s.row}
            >
              <span style={s.handle} aria-hidden="true">
                <Icon.Menu size={14} />
              </span>
              <Checkbox checked={bound.has(id)} onChange={() => toggle(id)} />
              <span style={s.name}>{skill.name}</span>
              <Badge>{skill.type}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
