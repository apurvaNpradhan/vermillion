import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";

const TITLE_MAX = 200;
const BODY_MAX = 10_000;

type Values = { title: string; body: string };

/** Title and body fields with save/cancel; used to create and to edit. */
export function NoteForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Values;
  submitLabel: string;
  onSubmit: (values: Values) => Promise<void>;
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
        <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t("notes__field_body")}</FieldLabel>
        <Textarea value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} />
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
