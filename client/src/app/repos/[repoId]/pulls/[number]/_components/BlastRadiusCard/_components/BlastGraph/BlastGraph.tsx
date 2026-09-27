/* BlastGraph — the Graph view of the Blast radius card (R13, T9): three
   columns left→right (changed symbols → callers → endpoints affected),
   joined by curved edges, with a legend. Pure layout comes from
   `buildGraphLayout` in `../../helpers.ts`; this component only renders it.

   Inline SVG, no new dependency (no mermaid/recharts — plan constraint).
   No floating tooltip is added, so the "portal any floating panel to
   document.body" convention (client Insights 2026-09-19) doesn't apply here.

   Note: this folder's owned paths (T9 plan) are `BlastGraph.tsx` + `index.ts`
   only (no sibling `styles.ts`), unlike this feature's other subcomponents —
   styles are kept as a local `const s` in this file to stay inside that
   scope. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { buildGraphLayout, type GraphNode } from "../../helpers";

interface BlastGraphProps {
  data: BlastRadiusResponse;
}

const GRAPH_WIDTH = 640;
const NODE_WIDTH = 176;
const NODE_HEIGHT = 30;
const V_PADDING = 24;
/** Column x-centers, as fractions of `GRAPH_WIDTH` (symbol / caller / endpoint).
 *  A fixed 3-tuple so indexing by a `0 | 1 | 2` column never yields
 *  `undefined` under `noUncheckedIndexedAccess`. */
const COLUMN_X: [number, number, number] = [GRAPH_WIDTH * 0.14, GRAPH_WIDTH * 0.5, GRAPH_WIDTH * 0.86];

const s = {
  empty: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 8,
  } satisfies CSSProperties,
  svg: {
    width: "100%",
    height: "auto",
    marginTop: 8,
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 8,
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  legendDot: (color: string): CSSProperties => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: color,
  }),
  nodeText: {
    fontSize: 11,
    fill: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;

/** Smooth cubic-bezier curve from a node's right edge to the next column's left edge. */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

function GraphNodeShape({ node, clipId }: { node: GraphNode; clipId: string }) {
  // Column 0 (changed symbol) and column 2 (endpoint) get the accent border;
  // column 1 (caller) gets the neutral border (target design).
  const accent = node.column !== 1;
  const x = COLUMN_X[node.column] - NODE_WIDTH / 2;
  const y = node.y - NODE_HEIGHT / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        fill="var(--bg-elevated)"
        stroke={accent ? "var(--accent)" : "var(--border)"}
        strokeWidth={1.2}
      />
      <clipPath id={clipId}>
        <rect x={x + 8} y={y} width={NODE_WIDTH - 16} height={NODE_HEIGHT} />
      </clipPath>
      <text
        x={COLUMN_X[node.column]}
        y={node.y}
        textAnchor="middle"
        dominantBaseline="middle"
        clipPath={`url(#${clipId})`}
        className="mono"
        style={s.nodeText}
      >
        {node.label}
      </text>
    </g>
  );
}

export function BlastGraph({ data }: BlastGraphProps) {
  const t = useTranslations("blast");
  const layout = React.useMemo(() => buildGraphLayout(data, GRAPH_WIDTH), [data]);

  if (layout.nodes.length === 0) {
    return <div style={s.empty}>{t("graph.empty")}</div>;
  }

  const height = Math.max(...layout.nodes.map((n) => n.y)) + NODE_HEIGHT / 2 + V_PADDING;
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div>
      <svg role="img" aria-label={t("graph.ariaLabel")} viewBox={`0 0 ${GRAPH_WIDTH} ${height}`} style={s.svg}>
        {layout.edges.map((e) => {
          const from = nodeById.get(e.from);
          const to = nodeById.get(e.to);
          if (!from || !to) return null;
          const x1 = COLUMN_X[from.column] + NODE_WIDTH / 2;
          const x2 = COLUMN_X[to.column] - NODE_WIDTH / 2;
          return (
            <path
              key={`${e.from}->${e.to}`}
              d={edgePath(x1, from.y, x2, to.y)}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1.2}
              opacity={0.5}
            />
          );
        })}
        {layout.nodes.map((n, i) => (
          <GraphNodeShape key={n.id} node={n} clipId={`blast-graph-clip-${i}`} />
        ))}
      </svg>
      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent)")} />
          {t("graph.legend.changed")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--border-strong)")} />
          {t("graph.legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent)")} />
          {t("graph.legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
