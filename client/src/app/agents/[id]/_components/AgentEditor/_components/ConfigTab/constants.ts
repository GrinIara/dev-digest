import type { ReviewStrategy } from "@devdigest/shared";

/** Selectable review strategies (labels are i18n'd in the component). */
export const STRATEGY_VALUES: readonly ReviewStrategy[] = ["single-pass", "map-reduce", "auto"];

/** Output-schema options (only one supported in MVP). */
export const OUTPUT_SCHEMA_VALUE = "Standard findings JSON";
