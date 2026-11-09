import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { LocalNote } from "@workspace/sync";
import { Alert } from "heroui-native";
import { MagnifyingGlass, NotePencil, Plus } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { useTabAction } from "@/platform/navigation/tab-action";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SearchBar } from "@/platform/ui/search-bar";
import { SkeletonList } from "@/platform/ui/skeleton";
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
  const {
    notes,
    isLoading,
    loadFailed,
    isFirstSync,
    search,
    setSearch,
    hasAnyNotes,
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

  const searching = search.trim() !== "";
  const empty = loadFailed ? null : isLoading || (isFirstSync && !searching) ? (
    <View className="gap-3">
      <SkeletonList label={t("common__loading")} />
      {isFirstSync ? (
        <Text className="text-center text-caption text-muted">{t("notes__first_sync")}</Text>
      ) : null}
    </View>
  ) : searching ? (
    <EmptyState icon={MagnifyingGlass} title={t("notes__search_empty", { query: search.trim() })} />
  ) : (
    <EmptyState
      icon={NotePencil}
      title={t("notes__empty")}
      action={{ label: t("notes__new"), onPress: () => setSheet({ kind: "new" }) }}
    />
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
            keyboardShouldPersistTaps="handled"
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
                {hasAnyNotes ? (
                  <SearchBar
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t("notes__search_placeholder")}
                    clearLabel={t("notes__search_clear")}
                  />
                ) : null}
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
              <View>
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
