import { LegendList } from "@legendapp/list/react-native";
import { Alert, Spinner } from "heroui-native";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useTranslation } from "@/platform/i18n";
import { SyncBanner, SyncStatusLine } from "@/sync";

import { useNotes } from "../use-notes";
import { NoteForm } from "./note-form";
import { NoteItem } from "./note-item";
import { RejectedNotes } from "./rejected-notes";
import { Card } from "@/platform/ui/card";

const ESTIMATED_NOTE_HEIGHT = 150;

/**
 * The notes list is a LegendList (virtualized, dynamic row heights), with everything above the
 * notes in its header so the whole screen scrolls as one list. Reaching the end widens the
 * window by one page (`loadMore`).
 */
export function NotesScreen() {
  const { t } = useTranslation();
  const { notes, isLoading, loadFailed, isFirstSync, hasMore, loadMore, create, update, remove } =
    useNotes();
  const [editing, setEditing] = useState<string | null>(null);
  const stopEditing = useCallback(() => setEditing(null), []);

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
    <LegendList
      className="flex-1 bg-background"
      contentContainerClassName="grow gap-4 p-4"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} />}
      data={notes}
      keyExtractor={(note) => note.id}
      extraData={editing}
      estimatedItemSize={ESTIMATED_NOTE_HEIGHT}
      onEndReached={hasMore ? loadMore : undefined}
      onEndReachedThreshold={1.5}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item: note }) => (
        <NoteItem
          note={note}
          isEditing={editing === note.id}
          onEdit={setEditing}
          onRemove={remove}
          onSave={update}
          onSaveAsNew={create}
          onDone={stopEditing}
        />
      )}
    />
  );
}
