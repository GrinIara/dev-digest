"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

/** Regenerate button with a local tooltip (there is no Tooltip primitive in
    @devdigest/ui) warning that it makes a new paid model call. */
export function RefreshControl({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const tipId = React.useId();
  return (
    <span
      style={s.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Button
        kind="secondary"
        size="sm"
        icon="RefreshCw"
        loading={loading}
        aria-label={t("refresh")}
        aria-describedby={open ? tipId : undefined}
        onClick={onClick}
      />
      {open && (
        <span role="tooltip" id={tipId} style={s.tip}>
          {t("refreshHint")}
        </span>
      )}
    </span>
  );
}
