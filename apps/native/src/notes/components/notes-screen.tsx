import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { LocalNote } from "@workspace/sync";
import { Alert, Spinner, useThemeColor } from "heroui-native";
import { NotePencil, Plus } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { useTabAction } from "@/platform/navigation/tab-action";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Page } from "@/platform/ui/page";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { SyncBanner, SyncStatusLine } from "@/sync";

import { useNotes } from "../use-notes";
import { NoteCard, noteActions } from "./note-card";
import { NoteComposer, type NoteComposerTarget } from "./note-composer";
import { RejectedNotes } from "./rejected-notes";

const ESTIMATED_NOTE_HEIGHT = 96;
const ListScrollView = Animated.createAnimatedComponent(GestureScrollView);

/**
 * The notes list: a virtualised LegendList under the collapsing page header, cards 12pt apart.
 * "New note" is the round button beside the tab bar; tapping a card edits it in the same sheet.
 * Reaching the end widens the window by one page (`loadMore`).
 */
export function NotesScreen() {
  const { t } = useTranslation();
  const muted = useThemeColor("muted");
  const {
    notes,
    isLoading,
    loadFailed,
    isFirstSync,
    hasMore,
    loadMore,
    create,
    update,
    removeWithUndo,
  } = useNotes();
  const [sheet, setSheet] = useState<NoteComposerTarget | null>(null);
  const [menuFor, setMenuFor] = useState<LocalNote | null>(null);
  // The last note stays in the long-press sheet while it slides away.
  const [menuShown, setMenuShown] = useState<LocalNote | null>(null);
  if (menuFor !== null && menuFor !== menuShown) setMenuShown(menuFor);

  useTabAction(
    useMemo(
      () => ({ icon: Plus, label: t("notes__new"), onPress: () => setSheet({ kind: "new" }) }),
      [t],
    ),
  );

  const openNote = useCallback((note: LocalNote) => setSheet({ kind: "edit", note }), []);

  const empty = loadFailed ? null : isLoading ? (
    <View className="items-center py-12" accessibilityLabel={t("common__loading")}>
      <Spinner />
    </View>
  ) : (
    <View className="items-center gap-3 px-6 py-12">
      <NotePencil size={48} color={muted} />
      <Text className="text-center text-body text-muted">
        {isFirstSync ? t("notes__first_sync") : t("notes__empty")}
      </Text>
    </View>
  );

  return (
    <SwipeGroup>
      <Page title={t("notes__title")}>
        {({ header, contentContainerStyle, ...scroll }) => (
          <AnimatedLegendList
            {...scroll}
            className="flex-1"
            contentContainerClassName="px-4"
            contentContainerStyle={contentContainerStyle}
            accessibilityLabel={t("notes__list_label")}
            // Gesture-handler's scroll view, so a vertical scroll that starts on a card wins over
            // the card's swipe instead of being taken by it.
            renderScrollComponent={(props) => <ListScrollView {...props} />}
            data={notes}
            keyExtractor={(note) => note.id}
            estimatedItemSize={ESTIMATED_NOTE_HEIGHT}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={1.5}
            ListHeaderComponent={
              <View className="gap-3 pb-3">
                {header}
                <SyncBanner />
                <SyncStatusLine />
                <RejectedNotes />
                {loadFailed ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{t("notes__load_failed")}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </View>
            }
            ListEmptyComponent={empty}
            // LegendList positions rows itself, so the 12pt gap is padding on each row.
            renderItem={({ item: note }) => (
              <View className="pb-3">
                <NoteCard
                  note={note}
                  onEdit={openNote}
                  onDelete={removeWithUndo}
                  onLongPress={setMenuFor}
                />
              </View>
            )}
          />
        )}
      </Page>
      <NoteComposer
        target={sheet}
        onClose={() => setSheet(null)}
        onCreate={create}
        onSave={update}
      />
      <ActionSheet
        title={menuShown?.title ?? ""}
        actions={
          menuShown ? noteActions(menuShown, t, { onEdit: openNote, onDelete: removeWithUndo }) : []
        }
        isOpen={menuFor !== null}
        onOpenChange={(open) => {
          if (!open) setMenuFor(null);
        }}
      />
    </SwipeGroup>
  );
}
