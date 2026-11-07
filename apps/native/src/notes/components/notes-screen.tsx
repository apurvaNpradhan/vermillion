import { Button, Card } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Screen } from "@/platform/ui/screen";

import { useNotes } from "../use-notes";
import { NoteForm } from "./note-form";

export function NotesScreen() {
  const { t } = useTranslation();
  const { notes, isLoading, create, update, remove } = useNotes();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Screen>
      <Card>
        <Card.Header>
          <Card.Title>{t("notes__new")}</Card.Title>
        </Card.Header>
        <Card.Body>
          <NoteForm
            initial={{ title: "", body: "" }}
            submitLabel={t("notes__add")}
            onSubmit={create}
          />
        </Card.Body>
      </Card>

      {notes.length === 0 ? (
        <Text className="text-center text-muted">
          {isLoading ? t("common__loading") : t("notes__empty")}
        </Text>
      ) : (
        notes.map((note) => (
          <Card key={note.id}>
            {editing === note.id ? (
              <Card.Body>
                <NoteForm
                  initial={note}
                  submitLabel={t("common__save")}
                  onSubmit={async (values) => {
                    await update({ id: note.id, ...values });
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </Card.Body>
            ) : (
              <>
                <Card.Header>
                  <Card.Title>{note.title}</Card.Title>
                  {note.body ? <Card.Description>{note.body}</Card.Description> : null}
                </Card.Header>
                <Card.Footer>
                  <View className="flex-row gap-2">
                    <Button size="sm" variant="secondary" onPress={() => setEditing(note.id)}>
                      <Button.Label>{t("notes__edit")}</Button.Label>
                    </Button>
                    <Button size="sm" variant="danger" onPress={() => void remove(note.id)}>
                      <Button.Label>{t("common__delete")}</Button.Label>
                    </Button>
                  </View>
                </Card.Footer>
              </>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}
