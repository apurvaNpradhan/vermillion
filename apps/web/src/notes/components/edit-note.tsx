import {
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  applyLatest,
  draftPatch,
  editDraft,
  startDraft,
  type NotePatch,
} from "@workspace/sync";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useState } from "react";

import { useTranslation } from "@/platform/i18n";

import { useLiveNote, type Note } from "../use-notes";

/**
 * Edit form for one note (ADR 0019). It remembers what each field held when editing started and
 * saves only the fields the user changed. If the note changes underneath, fields the user has not
 * touched follow it; if it is deleted, the form says so and offers to keep the text as a new note
 * or drop it. Restoring a deleted note is a separate action the app does not offer.
 */
export function EditNote({
  note,
  onSave,
  onSaveAsNew,
  onDone,
}: {
  note: Note;
  onSave: (patch: NotePatch) => Promise<void>;
  onSaveAsNew: (values: { title: string; body: string }) => Promise<void>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const live = useLiveNote(note.id);
  const [draft, setDraft] = useState(() => startDraft(note));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (live !== undefined) setDraft((current) => applyLatest(current, live));
  }, [live]);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
      onDone();
    } catch {
      // The global handler shows the error toast; keep the text for another try.
    } finally {
      setSaving(false);
    }
  }

  const titleBlank = draft.values.title.trim() === "";

  if (draft.deleted) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="warning">
          <AlertTitle>{t("notes__deleted_title")}</AlertTitle>
          <AlertDescription>{t("notes__deleted_body")}</AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button
            loading={saving}
            disabled={titleBlank}
            onClick={() =>
              void run(() =>
                onSaveAsNew({ title: draft.values.title.trim(), body: draft.values.body }),
              )
            }
          >
            {t("notes__save_as_new")}
          </Button>
          <Button variant="outline" onClick={onDone}>
            {t("notes__discard_changes")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const patch = draftPatch(draft);
        const trimmed = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() };
        void run(() => (Object.keys(trimmed).length === 0 ? Promise.resolve() : onSave(trimmed)));
      }}
    >
      <Field>
        <FieldLabel>{t("notes__field_title")}</FieldLabel>
        <Input
          value={draft.values.title}
          maxLength={NOTE_TITLE_MAX}
          onChange={(e) => setDraft(editDraft(draft, "title", e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel>{t("notes__field_body")}</FieldLabel>
        <Textarea
          value={draft.values.body}
          maxLength={NOTE_BODY_MAX}
          onChange={(e) => setDraft(editDraft(draft, "body", e.target.value))}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={saving} disabled={titleBlank}>
          {t("common__save")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common__cancel")}
        </Button>
      </div>
    </form>
  );
}
