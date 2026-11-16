import { SESSION_LIMITS } from "@workspace/shared";
import { useEffect, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { InlineNote, TargetPickerSheet } from "@/training";

/** The note on an exercise of this Session: a sheet with one growing field and Done. */
export function NoteSheet({
  isOpen,
  onOpenChange,
  title,
  value,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string | null;
  onSave: (note: string | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(value);
  useEffect(() => {
    if (isOpen) setDraft(value);
  }, [isOpen, value]);
  return (
    <TargetPickerSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      description={t("session__note_hint")}
      onDone={() => {
        onSave(draft);
        onOpenChange(false);
      }}
    >
      <InlineNote
        label={t("training__pinned_note")}
        value={draft}
        onText={setDraft}
        placeholder={t("training__pinned_note_placeholder")}
        maxLength={SESSION_LIMITS.noteMax}
      />
    </TargetPickerSheet>
  );
}
