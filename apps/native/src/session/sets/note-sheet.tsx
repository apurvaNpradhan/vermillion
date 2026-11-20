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
  label,
  hint,
  placeholder,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string | null;
  /** Defaults to the note of this session's exercise. */
  label?: string;
  hint?: string;
  placeholder?: string;
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
      description={hint ?? t("session__note_hint")}
      onDone={() => {
        onSave(draft);
        onOpenChange(false);
      }}
    >
      <InlineNote
        label={label ?? t("training__pinned_note")}
        value={draft}
        onText={setDraft}
        placeholder={placeholder ?? t("training__pinned_note_placeholder")}
        maxLength={SESSION_LIMITS.noteMax}
      />
    </TargetPickerSheet>
  );
}
