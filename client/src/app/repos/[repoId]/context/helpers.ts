import type { ContextDoc } from "@/lib/types";

export interface DocTreeFile {
  kind: "file";
  name: string;
  doc: ContextDoc;
}
export interface DocTreeFolder {
  kind: "folder";
  name: string;
  /** Repo-relative folder path (no trailing slash). */
  path: string;
  children: DocTreeNode[];
}
export type DocTreeNode = DocTreeFile | DocTreeFolder;

/** Folders first, then files; each group alphabetical. */
function sortNodes(nodes: DocTreeNode[]): void {
  nodes.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1,
  );
  for (const n of nodes) if (n.kind === "folder") sortNodes(n.children);
}

/** Builds a nested folder tree from the flat, repo-relative doc list. */
export function buildDocTree(docs: ContextDoc[]): DocTreeNode[] {
  const root: DocTreeNode[] = [];
  for (const doc of docs) {
    const parts = doc.path.split("/");
    let level = root;
    let acc = "";
    for (const seg of parts.slice(0, -1)) {
      acc = acc ? `${acc}/${seg}` : seg;
      let folder = level.find((n): n is DocTreeFolder => n.kind === "folder" && n.name === seg);
      if (!folder) {
        folder = { kind: "folder", name: seg, path: acc, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ kind: "file", name: parts[parts.length - 1] ?? doc.path, doc });
  }
  sortNodes(root);
  return root;
}

/** Compact token count for estimates (raw number below 1000, then "1.2k"). */
export function formatApproxTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

/** "specs/, docs/, insights/ and README.md files" from the server's `roots` labels. */
export function formatRootsForEmptyState(roots: string[]): string {
  const dirs = roots.filter((r) => r.endsWith("/"));
  const files = roots.filter((r) => !r.endsWith("/"));
  const dirPart = dirs.join(", ");
  if (files.length === 0) return dirPart;
  const filePart = `${files.join(", ")} files`;
  return dirPart ? `${dirPart} and ${filePart}` : filePart;
}
