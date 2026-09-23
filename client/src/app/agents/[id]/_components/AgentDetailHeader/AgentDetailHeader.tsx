/* AgentDetailHeader — the title/provider/model/enabled row above the Config
   tabs, plus the "Run on a PR…" shortcut. Extracted out of page.tsx to keep
   the route thin. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Icon, Badge } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";

export function AgentDetailHeader({ agent }: { agent: Agent }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
      <Icon.Cpu size={18} style={{ color: "var(--accent)" }} />
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>{agent.name}</h1>
      <Badge color="var(--text-secondary)" mono>
        {agent.provider}/{agent.model}
      </Badge>
      {!agent.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
      <div style={{ marginLeft: "auto" }}>
        <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
          Run on a PR…
        </Button>
      </div>
    </div>
  );
}
