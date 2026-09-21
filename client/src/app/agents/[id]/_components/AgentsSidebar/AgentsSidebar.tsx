/* AgentsSidebar — the 280px agent list on the left of the Agent Editor page:
   "Agents" header + Add dropdown, then one AgentCard per agent (selecting one
   navigates to /agents/:id). Extracted out of page.tsx to keep the route thin. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Dropdown } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { AgentCard } from "../../../_components/AgentCard";

export function AgentsSidebar({
  agents,
  activeId,
  tab,
  onToggleAgent,
}: {
  agents: Agent[] | undefined;
  activeId: string;
  /** Preserves the current ?tab= when navigating to another agent. */
  tab: string;
  onToggleAgent: (id: string, enabled: boolean) => void;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Agents</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                Add
              </Button>
            }
            items={[{ label: "Create from scratch", icon: "Edit", onClick: () => router.push("/agents") }]}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
        {(agents ?? []).map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            href={`/agents/${a.id}?tab=${tab}`}
            onToggle={(enabled) => onToggleAgent(a.id, enabled)}
          />
        ))}
      </div>
    </div>
  );
}
