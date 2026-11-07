import {
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  applyLatest,
  draftPatch,
  editDraft,
  startDraft,
  type NotePatch,
} from "@workspace/sync";
import { Alert, Button, Input, Label, Spinner, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { useLiveNote } from "../use-notes";

type Note = { id: string; title: string; body: string };

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
      // The global handler reports the error; keep the text for another try.
    } finally {
      setSaving(false);
    }
  }

  const titleBlank = draft.values.title.trim() === "";

  if (draft.deleted) {
    return (
      <View className="gap-3">
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t("notes__deleted_title")}</Alert.Title>
            <Alert.Description>{t("notes__deleted_body")}</Alert.Description>
          </Alert.Content>
        </Alert>
        <View className="flex-row gap-2">
          <Button
            isDisabled={saving || titleBlank}
            onPress={() =>
              void run(() =>
                onSaveAsNew({ title: draft.values.title.trim(), body: draft.values.body }),
              )
            }
          >
            {saving ? <Spinner size="sm" /> : null}
            <Button.Label>{t("notes__save_as_new")}</Button.Label>
          </Button>
          <Button variant="secondary" onPress={onDone}>
            <Button.Label>{t("notes__discard_changes")}</Button.Label>
          </Button>
        </View>
      </View>
    );
  }

  function save() {
    const patch = draftPatch(draft);
    const trimmed = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() };
    void run(() => (Object.keys(trimmed).length === 0 ? Promise.resolve() : onSave(trimmed)));
  }

  return (
    <View className="gap-3">
      <TextField>
        <Label>{t("notes__field_title")}</Label>
        <Input
          value={draft.values.title}
          onChangeText={(value) => setDraft(editDraft(draft, "title", value))}
          maxLength={NOTE_TITLE_MAX}
        />
      </TextField>
      <TextField>
        <Label>{t("notes__field_body")}</Label>
        <Input
          value={draft.values.body}
          onChangeText={(value) => setDraft(editDraft(draft, "body", value))}
          maxLength={NOTE_BODY_MAX}
          multiline
        />
      </TextField>
      <View className="flex-row gap-2">
        <Button isDisabled={saving || titleBlank} onPress={save}>
          {saving ? <Spinner size="sm" /> : null}
          <Button.Label>{t("common__save")}</Button.Label>
        </Button>
        <Button variant="secondary" onPress={onDone}>
          <Button.Label>{t("common__cancel")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
