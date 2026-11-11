import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { EQUIPMENT_KEYS, MUSCLE_GROUP_KEYS, type MuscleGroup } from "@workspace/shared";
import {
  DEFAULT_LIBRARY_FILTERS,
  hasActiveFilters,
  type LibraryFilters,
  type LibraryRow,
  type LibrarySort,
} from "@workspace/sync";
import { Plus } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useTabAction } from "@/platform/navigation/tab-action";
import { deviceStorage } from "@/platform/storage";
import { Page } from "@/platform/ui/page";
import { SearchBar } from "@/platform/ui/search-bar";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { SyncBanner } from "@/sync";

import { toggled, withoutFacets } from "../filter-state";
import { SORT_KEY, parseSort } from "../sort-preference";
import { useExerciseLibrary } from "../use-exercise-library";
import { ExerciseRow } from "./exercise-row";
import { FilterChips, type FilterChip } from "./filter-chips";
import { FilterPill } from "./filter-pill";
import { FilterSheet, type FilterSection } from "./filter-sheet";
import { RejectedExercises } from "./rejected-exercises";
import {
  ArchivedEmptyState,
  ExerciseSkeletonRows,
  FirstSyncState,
  LoadFailedState,
  NoMatchesState,
  OfflineState,
} from "./library-states";

const ESTIMATED_ROW_HEIGHT = 72;
/** Search field (44), gap (8) and pill row (36), plus the pinned layer's bottom padding (8) and 8 of air. */
const PINNED_HEIGHT = 104;

type ListItem =
  | { kind: "header"; key: string; title: string }
  | { kind: "row"; key: string; exercise: LibraryRow };

type ExerciseLibraryProps = {
  /** `browse` opens exercises; `pick` toggles them (the picker draws its own selection bar). */
  mode: "browse" | "pick";
  /** Header title; the library's own by default. */
  title?: string;
  /** Icon buttons for the header capsule (the picker's close and New buttons). */
  headerActions?: ReactNode;
  /** Content above the list, under the search (the picker's "Swap for" suggestions). */
  listHeader?: ReactNode;
  /** Pick: selected ids with their 1-based position in the selection. */
  selectedOrder?: ReadonlyMap<string, number>;
  /** Pick: ids that cannot be picked (already in the workout). Archived ones never can. */
  disabledIds?: readonly string[];
  /** Clearance below the list for a bar the screen draws over it, on top of the tab bar's. */
  bottomInset?: number;
  /** Browse: open an exercise. Without it rows are not pressable. */
  onOpen?: (id: string) => void;
  /** Pick: toggle an exercise in the selection. */
  onToggle?: (id: string) => void;
  /**
   * Create an exercise, prefilled with the searched title (empty when there was none). Without it
   * the "New exercise" action and "Create ‹query›" are not shown.
   */
  onCreate?: (title: string) => void;
  /**
   * Archive (and restore) a Custom exercise by swiping its row in the Custom and Archived views.
   * Without them rows do not swipe.
   */
  onArchive?: (id: string, title: string) => void;
  onRestore?: (id: string) => void;
  /**
   * A muscle group to filter by, from "Browse <group>" on a detail screen. `at` changes on every
   * request, so asking for the same group again re-applies it after the filters were cleared.
   */
  browseMuscle?: { muscle: MuscleGroup; at?: string };
};

/**
 * The exercise library: search, two filter pills, removable chips, a sort toggle and a
 * virtualised list of rows, under the page header. The search and pills stay pinned under the
 * compact bar. Everything is read from the local database through `useExerciseLibrary`.
 */
export function ExerciseLibrary({
  mode,
  title,
  headerActions,
  listHeader,
  selectedOrder,
  disabledIds,
  bottomInset = 0,
  onOpen,
  onToggle,
  onCreate,
  onArchive,
  onRestore,
  browseMuscle,
}: ExerciseLibraryProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<LibraryFilters>(() => ({
    ...DEFAULT_LIBRARY_FILTERS,
    sort: parseSort(deviceStorage.get(SORT_KEY)),
  }));
  const [sheet, setSheet] = useState<{ open: boolean; section: FilterSection | null }>({
    open: false,
    section: null,
  });
  const browsedMuscle = browseMuscle?.muscle;
  const browsedAt = browseMuscle?.at;
  useEffect(() => {
    if (browsedMuscle === undefined) return;
    setFilters((current) => ({
      ...withoutFacets(current),
      search: "",
      muscles: [browsedMuscle],
    }));
  }, [browsedMuscle, browsedAt]);
  const library = useExerciseLibrary(filters);
  const query = filters.search.trim();
  const searching = query !== "";

  const setSort = useCallback((sort: LibrarySort) => {
    deviceStorage.set(SORT_KEY, sort);
    setFilters((current) => ({ ...current, sort }));
  }, []);
  const openSheet = useCallback(
    (section: FilterSection | null) => setSheet({ open: true, section }),
    [],
  );

  const chips = useMemo<FilterChip[]>(() => {
    const change = (next: Partial<LibraryFilters>) =>
      setFilters((current) => ({ ...current, ...next }));
    return [
      ...filters.muscles.map((muscle) => ({
        key: `muscle-${muscle}`,
        label: t(MUSCLE_GROUP_KEYS[muscle]),
        onRemove: () => change({ muscles: toggled(filters.muscles, muscle) }),
      })),
      ...filters.equipment.map((kind) => ({
        key: `equipment-${kind}`,
        label: t(EQUIPMENT_KEYS[kind]),
        onRemove: () => change({ equipment: toggled(filters.equipment, kind) }),
      })),
      ...(filters.show === "all"
        ? []
        : [
            {
              key: "show",
              label: t(
                filters.show === "custom" ? "exercise__show_custom" : "exercise__show_archived",
              ),
              onRemove: () => change({ show: "all" }),
            },
          ]),
    ];
  }, [filters.muscles, filters.equipment, filters.show, t]);

  const items = useMemo<ListItem[]>(() => {
    const rows = library.rows.map((exercise): ListItem => ({
      kind: "row",
      key: `all-${exercise.id}`,
      exercise,
    }));
    if (library.recent.length === 0 || searching) return rows;
    return [
      { kind: "header", key: "recent", title: t("exercise__recent") },
      ...library.recent.map((exercise): ListItem => ({
        kind: "row",
        key: `recent-${exercise.id}`,
        exercise,
      })),
      { kind: "header", key: "all", title: t("exercise__all") },
      ...rows,
    ];
  }, [library.rows, library.recent, searching, t]);

  const onRowPress = mode === "pick" ? onToggle : onOpen;
  // Only the Custom and Archived views swipe: "All" mixes in the read-only catalog.
  const swipeable = mode === "browse" && filters.show !== "all";
  const rowArchive = swipeable ? onArchive : undefined;
  const rowRestore = swipeable ? onRestore : undefined;
  const renderItem = useCallback(
    ({ item }: { item: ListItem }) =>
      item.kind === "header" ? (
        <Text
          accessibilityRole="header"
          className="px-4 pb-2 pt-4 font-semibold text-overline uppercase text-muted"
        >
          {item.title}
        </Text>
      ) : (
        <ExerciseRow
          exercise={item.exercise}
          mode={mode}
          selectedOrder={selectedOrder?.get(item.exercise.id)}
          disabled={
            mode === "pick" && (item.exercise.isArchived || disabledIds?.includes(item.exercise.id))
          }
          onPress={onRowPress}
          onArchive={rowArchive}
          onRestore={rowRestore}
        />
      ),
    [mode, selectedOrder, disabledIds, onRowPress, rowArchive, rowRestore],
  );

  const clearFilters = useCallback(
    () => setFilters((current) => ({ ...withoutFacets(current), search: "" })),
    [],
  );

  const status = library.status;
  const stateView: ReactNode = (() => {
    if (status === "error") return <LoadFailedState onRetry={library.retry} />;
    if (library.isLoading) {
      return <ExerciseSkeletonRows label={t("common__loading")} />;
    }
    if (status === "first-sync") return <FirstSyncState />;
    if (status === "offline-unsynced") return <OfflineState onCreate={onCreate} />;
    if (library.rows.length > 0) return null;
    if (filters.show === "archived" && !searching && filters.muscles.length === 0) {
      return <ArchivedEmptyState />;
    }
    return (
      <NoMatchesState
        query={query}
        canClear={searching || hasActiveFilters(filters)}
        onClear={clearFilters}
        onCreate={onCreate}
      />
    );
  })();
  // With rows to show (the user's own while the catalog downloads), the state goes below them.
  const rowsAboveState = library.rows.length > 0 && stateView !== null;

  const musclePillLabel =
    filters.muscles.length === 0
      ? t("exercise__filter_muscle_any")
      : filters.muscles.length === 1
        ? t(MUSCLE_GROUP_KEYS[filters.muscles[0] ?? "other"])
        : t("exercise__filter_more", {
            first: t(MUSCLE_GROUP_KEYS[filters.muscles[0] ?? "other"]),
            count: filters.muscles.length - 1,
          });
  const equipmentPillLabel =
    filters.equipment.length === 0
      ? t("exercise__filter_equipment_any")
      : filters.equipment.length === 1
        ? t(EQUIPMENT_KEYS[filters.equipment[0] ?? "other"])
        : t("exercise__filter_more", {
            first: t(EQUIPMENT_KEYS[filters.equipment[0] ?? "other"]),
            count: filters.equipment.length - 1,
          });

  return (
    <SwipeGroup>
      {onCreate && mode === "browse" ? <NewExerciseAction onCreate={onCreate} /> : null}
      <Page
        title={title ?? t("exercise__title")}
        actions={headerActions}
        pinned={{
          height: PINNED_HEIGHT,
          children: (
            <View className="gap-2">
              <SearchBar
                value={filters.search}
                onChangeText={(search) => setFilters((current) => ({ ...current, search }))}
                placeholder={t("exercise__search_placeholder")}
                clearLabel={t("exercise__search_clear")}
              />
              <View className="flex-row gap-2">
                <FilterPill
                  label={musclePillLabel}
                  active={filters.muscles.length > 0}
                  accessibilityLabel={t("exercise__filter_open", {
                    section: t("exercise__section_muscle"),
                  })}
                  onPress={() => openSheet("muscle")}
                />
                <FilterPill
                  label={equipmentPillLabel}
                  active={filters.equipment.length > 0}
                  accessibilityLabel={t("exercise__filter_open", {
                    section: t("exercise__section_equipment"),
                  })}
                  onPress={() => openSheet("equipment")}
                />
              </View>
            </View>
          ),
        }}
      >
        {({ header, contentContainerStyle, ...scroll }) => (
          <AnimatedLegendList
            recycleItems={false}
            {...scroll}
            className="flex-1"
            contentContainerStyle={{
              ...contentContainerStyle,
              paddingBottom: contentContainerStyle.paddingBottom + bottomInset,
            }}
            accessibilityLabel={t("exercise__list_label")}
            // The browse list is long (hundreds of rows): its indicator is the position cue.
            showsVerticalScrollIndicator={mode === "browse"}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            data={status === "error" ? [] : items}
            // The list re-renders rows only when the data changes; the selection is not in it.
            extraData={renderItem}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.kind}
            estimatedItemSize={ESTIMATED_ROW_HEIGHT}
            onEndReached={library.hasMore ? library.loadMore : undefined}
            onEndReachedThreshold={1.5}
            renderItem={renderItem}
            ListHeaderComponent={
              <View>
                <View className="px-4">{header}</View>
                <View className="gap-3 px-4 pb-3">
                  <SyncBanner />
                  <RejectedExercises />
                  {listHeader}
                  <FilterChips chips={chips} />
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="flex-1 text-caption text-muted">
                      {library.total === null || status !== "ready"
                        ? ""
                        : t("exercise__count", { count: library.total })}
                    </Text>
                    {searching ? null : (
                      <View className="w-44">
                        <SegmentedControl<LibrarySort>
                          options={[
                            { value: "az", label: t("exercise__sort_az") },
                            { value: "popular", label: t("exercise__sort_popular") },
                          ]}
                          value={filters.sort}
                          onChange={setSort}
                          accessibilityLabel={t("exercise__sort_group")}
                        />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={stateView}
            ListFooterComponent={rowsAboveState ? stateView : null}
          />
        )}
      </Page>
      <FilterSheet
        isOpen={sheet.open}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        section={sheet.section}
        filters={filters}
        onChange={setFilters}
        total={library.total}
      />
    </SwipeGroup>
  );
}

/** The round "New exercise" button beside the tab pill, while the library is the open tab. */
function NewExerciseAction({ onCreate }: { onCreate: (title: string) => void }) {
  const { t } = useTranslation();
  useTabAction(
    useMemo(
      () => ({ icon: Plus, label: t("exercise__new"), onPress: () => onCreate("") }),
      [t, onCreate],
    ),
  );
  return null;
}
