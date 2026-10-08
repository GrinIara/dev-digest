"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Textarea } from "@devdigest/ui";
import { useSaveContextDoc } from "@/lib/hooks";
import { s } from "../../styles";

interface DocEditorProps {
  repoId: string;
  path: string;
  /** Last saved content — the dirty baseline. */
  content: string;
  onDirtyChange: (dirty: boolean) => void;
}

export function DocEditor({ repoId, path, content, onDirtyChange }: DocEditorProps) {
  const t = useTranslations("context.editor");
  const [value, setValue] = useState(content);
  const save = useSaveContextDoc(repoId);
  const isDirty = value !== content;

  // Tell the page about unsaved text; unmounting (leaving Edit) always clears it.
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  return (
    <div>
      <label style={s.editorLabel}>
        <span style={s.editorCaption}>{t("editorLabel", { path })}</span>
        <Textarea value={value} onChange={setValue} rows={20} mono />
      </label>
      <div style={s.editorActions}>
        <Button
          kind="primary"
          loading={save.isPending}
          disabled={save.isPending}
          onClick={() => save.mutate({ path, content: value })}
        >
          {save.isPending ? t("saving") : t("save")}
        </Button>
        {save.isError && (
          <div role="alert" style={s.editorError}>
            {t("saveError")}
          </div>
        )}
      </div>
    </div>
  );
}
