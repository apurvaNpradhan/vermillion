import type { LocalNote } from "@workspace/sync";
import type { TFunction } from "i18next";
import { PencilSimple, Trash } from "phosphor-react-native";
import { memo, useMemo } from "react";
import { Pressable, Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { SwipeRow, type SwipeAction } from "@/platform/ui/swipe-row";

import { noteTimestamp } from "../note-timestamp";

/** Lines of the body shown in the list; the full text is in the sheet. */
const BODY_PREVIEW_LINES = 2;

type NoteHandlers = {
  onEdit: (note: LocalNote) => void;
  onDelete: (id: string) => void;
};

/** Edit and delete, shared by the swipe and the long-press sheet. Delete is last, so a full swipe deletes. */
export function noteActions(note: LocalNote, t: TFunction, handlers: NoteHandlers): SwipeAction[] {
  return [
    {
      key: "edit",
      label: t("notes__edit"),
      icon: PencilSimple,
      onPress: () => handlers.onEdit(note),
    },
    {
      key: "delete",
      label: t("common__delete"),
      icon: Trash,
      tone: "danger",
      onPress: () => handlers.onDelete(note.id),
    },
  ];
}

/**
 * One note in the list: title, a two-line preview and when it last changed. Tap to edit, swipe
 * left to delete, long-press for the same actions in a sheet. Memoised: `useNotes` keeps the
 * object of an unchanged note and the callbacks are stable, so only a changed card re-renders.
 */
export const NoteCard = memo(function NoteCard({
  note,
  onEdit,
  onDelete,
  onLongPress,
}: NoteHandlers & {
  note: LocalNote;
  onLongPress: (note: LocalNote) => void;
}) {
  const { t, i18n } = useTranslation();
  const actions = useMemo(
    () => noteActions(note, t, { onEdit, onDelete }),
    [note, t, onEdit, onDelete],
  );
  const when = noteTimestamp(note.updatedAt, new Date(), i18n.language);
  return (
    <SwipeRow actions={actions}>
      {(a11y) => (
        <Pressable
          {...a11y}
          accessibilityRole="button"
          accessibilityLabel={note.title}
          accessibilityHint={t("notes__open_hint")}
          onPress={() => onEdit(note)}
          onLongPress={() => onLongPress(note)}
          delayLongPress={350}
          className="gap-1 rounded-2xl border border-border bg-surface p-4 active:bg-default"
        >
          <Text numberOfLines={1} className="font-medium text-body text-foreground">
            {note.title}
          </Text>
          {note.body ? (
            <Text numberOfLines={BODY_PREVIEW_LINES} className="text-body text-muted">
              {note.body}
            </Text>
          ) : null}
          <Text className="pt-1 text-caption tabular-nums text-muted">{when}</Text>
        </Pressable>
      )}
    </SwipeRow>
  );
});
