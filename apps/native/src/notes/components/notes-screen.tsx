import { Alert, Button, Card, Spinner } from "heroui-native";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useTranslation } from "@/platform/i18n";
import { SyncBanner, SyncStatusLine } from "@/sync";

import { useNotes } from "../use-notes";
import { EditNote } from "./edit-note";
import { NoteForm } from "./note-form";
import { RejectedNotes } from "./rejected-notes";

/**
 * The notes list is a FlatList (virtualized, window-sized by `useNotes`), with everything above
 * the notes in its header so the whole screen scrolls as one list.
 */
export function NotesScreen() {
  const { t } = useTranslation();
  const { notes, isLoading, loadFailed, isFirstSync, hasMore, loadMore, create, update, remove } =
    useNotes();
  const [editing, setEditing] = useState<string | null>(null);

  const header = (
    <View className="gap-4">
      <SyncBanner />
      <SyncStatusLine />
      <RejectedNotes />
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
      {loadFailed ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t("notes__load_failed")}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </View>
  );

  const empty = loadFailed ? null : isLoading ? (
    <View className="items-center p-4" accessibilityLabel={t("common__loading")}>
      <Spinner />
    </View>
  ) : (
    <Text className="text-center text-muted">
      {isFirstSync ? t("notes__first_sync") : t("notes__empty")}
    </Text>
  );

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="grow gap-4 p-4"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} />}
      data={notes}
      keyExtractor={(note) => note.id}
      extraData={editing}
      initialNumToRender={10}
      windowSize={7}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={
        hasMore ? (
          <Button variant="secondary" className="self-center" onPress={loadMore}>
            <Button.Label>{t("notes__load_more")}</Button.Label>
          </Button>
        ) : null
      }
      renderItem={({ item: note }) => (
        <Card>
          {editing === note.id ? (
            <Card.Body>
              <EditNote
                note={note}
                onSave={(patch) => update({ id: note.id, ...patch })}
                onSaveAsNew={create}
                onDone={() => setEditing(null)}
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
      )}
    />
  );
}
