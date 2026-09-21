import type { CiFailOn } from "@devdigest/shared";

/** CI gate policy options — when a CI review blocks/fails (labels i18n'd). */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];
