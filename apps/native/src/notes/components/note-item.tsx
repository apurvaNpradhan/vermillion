import type { LocalNote, NotePatch } from "@workspace/sync";
import { memo } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { EditNote } from "./edit-note";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";

/** Lines of the body shown in the list; the full text is in the edit form. */
const BODY_PREVIEW_LINES = 3;

type NoteItemProps = {
  note: LocalNote;
  isEditing: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSave: (input: { id: string } & NotePatch) => Promise<void>;
  onSaveAsNew: (values: { title: string; body: string }) => Promise<void>;
  onDone: () => void;
};

/**
 * One note card. Memoised: `useNotes` keeps the object of an unchanged note, and the callbacks
 * are stable, so only the card whose note (or edit state) changed re-renders.
 */
export const NoteItem = memo(function NoteItem({
  note,
  isEditing,
  onEdit,
  onRemove,
  onSave,
  onSaveAsNew,
  onDone,
}: NoteItemProps) {
  const { t } = useTranslation();
  return (
    <Card>
      {isEditing ? (
        <Card.Body>
          <EditNote
            note={note}
            onSave={(patch) => onSave({ id: note.id, ...patch })}
            onSaveAsNew={onSaveAsNew}
            onDone={onDone}
          />
        </Card.Body>
      ) : (
        <>
          <Card.Header>
            <Card.Title>{note.title}</Card.Title>
            {note.body ? (
              <Card.Description numberOfLines={BODY_PREVIEW_LINES}>{note.body}</Card.Description>
            ) : null}
          </Card.Header>
          <Card.Footer>
            <View className="flex-row gap-2">
              <Button size="sm" variant="secondary" onPress={() => onEdit(note.id)}>
                <Button.Label>{t("notes__edit")}</Button.Label>
              </Button>
              <Button size="sm" variant="danger-soft" onPress={() => void onRemove(note.id)}>
                <Button.Label>{t("common__delete")}</Button.Label>
              </Button>
            </View>
          </Card.Footer>
        </>
      )}
    </Card>
  );
});
