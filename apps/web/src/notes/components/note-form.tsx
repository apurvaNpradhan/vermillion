import { NOTE_BODY_MAX, NOTE_TITLE_MAX, type NoteValues } from "@workspace/sync";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";

/** Title and body fields with a submit button; creates a note or resubmits a rejected one. */
export function NoteForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: NoteValues;
  submitLabel: string;
  onSubmit: (values: NoteValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await onSubmit({ title: title.trim(), body });
          if (!onCancel) {
            setTitle("");
            setBody("");
          }
        } catch {
          // The global handler shows the error toast; keep the text for another try.
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field>
        <FieldLabel>{t("notes__field_title")}</FieldLabel>
        <Input
          value={title}
          maxLength={NOTE_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>{t("notes__field_body")}</FieldLabel>
        <Textarea
          value={body}
          maxLength={NOTE_BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={saving} disabled={title.trim() === ""}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common__cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
