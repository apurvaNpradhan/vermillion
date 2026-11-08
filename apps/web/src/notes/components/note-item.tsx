import type { NotePatch } from "@workspace/sync";
import { Button } from "@workspace/ui/components/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@workspace/ui/components/card";
import { memo } from "react";

import { useTranslation } from "@/platform/i18n";

import type { Note } from "../use-notes";
import { EditNote } from "./edit-note";

type NoteItemProps = {
  note: Note;
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
    <Card data-testid="note">
      {isEditing ? (
        <CardPanel>
          <EditNote
            note={note}
            onSave={(patch) => onSave({ id: note.id, ...patch })}
            onSaveAsNew={onSaveAsNew}
            onDone={onDone}
          />
        </CardPanel>
      ) : (
        <>
          <CardHeader>
            <CardTitle render={<h2 />}>{note.title}</CardTitle>
          </CardHeader>
          <CardPanel className="flex flex-col gap-3">
            {note.body ? <p className="whitespace-pre-wrap">{note.body}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(note.id)}>
                {t("notes__edit")}
              </Button>
              <Button
                size="sm"
                variant="destructive-outline"
                onClick={() => void onRemove(note.id)}
              >
                {t("common__delete")}
              </Button>
            </div>
          </CardPanel>
        </>
      )}
    </Card>
  );
});
