import type { BlastCaller, BlastRadiusResponse, ChangedSymbol } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

/** `repoFullName` is null until `useActiveRepo` resolves — render plain text then (R7/T5 risk a). */
export function callerHref(repoFullName: string | null, sha: string, c: BlastCaller): string | null {
  return repoFullName ? githubBlobUrl(repoFullName, sha, c.file, c.line) : null;
}

export function kindOf(changed: ChangedSymbol[], name: string): string | null {
  return changed.find((c) => c.name === name)?.kind ?? null;
}

export function displayName(name: string, kind: string | null): string {
  return kind === "function" || kind === "method" ? `${name}()` : name;
}

// ---- Graph view (T9, R13) ----

export interface GraphNode {
  id: string;
  label: string;
  column: 0 | 1 | 2;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Vertical gap between two node centers in the same column. */
const GRAPH_ROW_HEIGHT = 44;
/** Rough px-per-monospace-character used to size how many characters a
 *  column's node can show before it must ellipsis-truncate (R13's "labels
 *  truncated with … when too long, clip at the card edge"). Approximate on
 *  purpose: this only needs to keep long endpoint paths from overflowing a
 *  fixed-width SVG rect, not to pixel-measure text. */
const GRAPH_CHAR_PX = 7;
/** Horizontal padding (both sides) reserved inside a node rect. */
const GRAPH_NODE_H_PADDING = 24;

/** Ellipsis-truncates `label` to fit a node of `columnWidth` px (R13). */
function truncateForColumn(label: string, columnWidth: number): string {
  const maxChars = Math.max(6, Math.floor((columnWidth - GRAPH_NODE_H_PADDING) / GRAPH_CHAR_PX));
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

/** Centers `count` node positions within `totalHeight`, spaced
 *  `GRAPH_ROW_HEIGHT` apart, so a short column doesn't crowd against a
 *  taller one (T9 risk: "row height is derived from the max column size"). */
function centeredYs(count: number, totalHeight: number): number[] {
  if (count === 0) return [];
  const start = (totalHeight - count * GRAPH_ROW_HEIGHT) / 2 + GRAPH_ROW_HEIGHT / 2;
  return Array.from({ length: count }, (_, i) => start + i * GRAPH_ROW_HEIGHT);
}

/** Pairs `items` with their centered y position, one per item — `centeredYs`
 *  always returns exactly `items.length` values, so the index is safe. */
function centeredRows<T>(items: T[], totalHeight: number): Array<{ item: T; y: number }> {
  const ys = centeredYs(items.length, totalHeight);
  return items.map((item, i) => ({ item, y: ys[i] as number }));
}

const graphCallerId = (file: string, name: string) => `caller:${file}#${name}`;
const graphEndpointId = (endpoint: string) => `endpoint:${endpoint}`;
const graphSymbolId = (symbol: string) => `symbol:${symbol}`;

/**
 * Pure layout for the Graph view (R13): column 0 is the changed symbols,
 * column 1 their callers (deduped by `file#name`), column 2 the endpoints
 * those callers' files declare (per `facts_by_file`). `width` sizes each
 * column so long labels truncate instead of overflowing.
 *
 * Edges: symbol → caller for every caller entry (not deduped — two symbols
 * calling through the same function each draw their own edge to it), and
 * caller → endpoint only when `data.facts_by_file[caller.file]?.endpoints`
 * includes that endpoint (one-hop attribution, same rule as the server's
 * mapping — see A3/Q2 in the blast-radius plan).
 */
export function buildGraphLayout(data: BlastRadiusResponse, width: number): GraphLayout {
  const columnWidth = width / 3;

  const callerOrder: string[] = [];
  const callerLabelByKey = new Map<string, string>();
  const callerFileByKey = new Map<string, string>();
  const endpointOrder: string[] = [];
  const endpointSeen = new Set<string>();

  for (const d of data.downstream) {
    for (const c of d.callers) {
      const key = graphCallerId(c.file, c.name);
      if (!callerLabelByKey.has(key)) {
        callerLabelByKey.set(key, c.name);
        callerFileByKey.set(key, c.file);
        callerOrder.push(key);
      }
    }
    for (const e of d.endpoints_affected) {
      if (!endpointSeen.has(e)) {
        endpointSeen.add(e);
        endpointOrder.push(e);
      }
    }
  }

  const maxCount = Math.max(data.downstream.length, callerOrder.length, endpointOrder.length, 1);
  const totalHeight = maxCount * GRAPH_ROW_HEIGHT;

  const nodes: GraphNode[] = [];

  for (const { item: d, y } of centeredRows(data.downstream, totalHeight)) {
    const label = displayName(d.symbol, kindOf(data.changed_symbols, d.symbol));
    nodes.push({ id: graphSymbolId(d.symbol), label: truncateForColumn(label, columnWidth), column: 0, y });
  }

  for (const { item: key, y } of centeredRows(callerOrder, totalHeight)) {
    const label = callerLabelByKey.get(key) ?? key;
    nodes.push({ id: key, label: truncateForColumn(label, columnWidth), column: 1, y });
  }

  for (const { item: endpoint, y } of centeredRows(endpointOrder, totalHeight)) {
    nodes.push({ id: graphEndpointId(endpoint), label: truncateForColumn(endpoint, columnWidth), column: 2, y });
  }

  const edges: GraphEdge[] = [];
  for (const d of data.downstream) {
    const symbolId = graphSymbolId(d.symbol);
    for (const c of d.callers) {
      edges.push({ from: symbolId, to: graphCallerId(c.file, c.name) });
    }
  }
  for (const key of callerOrder) {
    const file = callerFileByKey.get(key);
    const callerEndpoints = (file && data.facts_by_file[file]?.endpoints) || [];
    for (const endpoint of endpointOrder) {
      if (callerEndpoints.includes(endpoint)) {
        edges.push({ from: key, to: graphEndpointId(endpoint) });
      }
    }
  }

  return { nodes, edges };
}
