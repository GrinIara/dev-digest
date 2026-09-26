/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract,
   plus the generic FileCard/annotation extension points consumers can use
   to inject their own domain content under a diff line. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export { FileCard } from "./FileCard";
export type { FileCardProps } from "./FileCard";
export type { Line } from "./helpers";
export { keysForLine } from "./comments";
export type { LineAnnotation, LineAnnotationMap } from "./annotations";
export { partitionAnnotations } from "./annotations";
