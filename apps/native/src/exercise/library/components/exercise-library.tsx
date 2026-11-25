import { AnimatedLegendList } from "@legendapp/list/reanimated";
import {
  EQUIPMENT_KEYS,
  MUSCLE_DETAIL_KEYS,
  MUSCLE_GROUP_KEYS,
  type MuscleDetail,
  type MuscleGroup,
} from "@workspace/shared";
import {
  DEFAULT_LIBRARY_FILTERS,
  hasActiveFilters,
  type LibraryFilters,
  type LibraryRow,
} from "@workspace/sync";
import { Plus } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useTabAction } from "@/platform/navigation/tab-action";
import { Button } from "@/platform/ui/button";
import { LibrarySetup } from "@/platform/ui/library-setup";
import { Page } from "@/platform/ui/page";
import { SearchBar } from "@/platform/ui/search-bar";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { SyncBanner } from "@/sync";

import { useExerciseActions } from "../../use-exercise-actions";
import { toggled, withoutFacets } from "../filter-state";
import { useExerciseLibrary } from "../use-exercise-library";
import { BodyMapFilter } from "./body-map-filter";
import { ExerciseRow } from "./exercise-row";
import { FilterChips, type FilterChip } from "./filter-chips";
import { FilterPill } from "./filter-pill";
import { FilterSheet } from "./filter-sheet";
import { RejectedExercises } from "./rejected-exercises";
import {
  ArchivedEmptyState,
  LoadFailedState,
  NoMatchesState,
  OfflineState,
} from "./library-states";

const ESTIMATED_ROW_HEIGHT = 72;
/**
 * Search field (44), gap (8), filter row (44) and the pinned layer's bottom padding (8), plus 8
 * so the results start below the opaque layer.
 */
const PINNED_HEIGHT = 112;

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
  /** The picker's swap suggestions, hidden by search, Pinned or a muscle filter. */
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
 * The exercise library: search, one filter control, removable chips, and a
 * virtualised list of rows, under the page header. The search and filter control stay pinned under the
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
    pinnedFirst: mode === "pick",
  }));
  const { setExercisePinned } = useExerciseActions();
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const showRecent = !searching && !hasActiveFilters(filters);
  const showSwapSuggestions =
    !searching &&
    !filters.pinnedOnly &&
    filters.muscles.length === 0 &&
    filters.primaryDetail === null;

  const chips = useMemo<FilterChip[]>(() => {
    const change = (next: Partial<LibraryFilters>) =>
      setFilters((current) => ({ ...current, ...next }));
    return [
      ...filters.muscles.map((muscle) => ({
        key: `muscle-${muscle}`,
        label: t(MUSCLE_GROUP_KEYS[muscle]),
        onRemove: () => change({ muscles: toggled(filters.muscles, muscle), primaryDetail: null }),
      })),
      ...(filters.primaryDetail === null
        ? []
        : [
            {
              key: "detail",
              label: t(MUSCLE_DETAIL_KEYS[filters.primaryDetail]),
              onRemove: () => change({ primaryDetail: null }),
            },
          ]),
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
  }, [filters.muscles, filters.primaryDetail, filters.equipment, filters.show, t]);

  const items = useMemo<ListItem[]>(() => {
    const rows = library.rows.map((exercise): ListItem => ({
      kind: "row",
      key: `all-${exercise.id}`,
      exercise,
    }));
    if (!showRecent) return rows;
    const recent =
      mode === "pick" ? library.recent.filter((exercise) => !exercise.isPinned) : library.recent;
    if (recent.length === 0) return rows;
    const firstUnpinned = library.rows.findIndex((exercise) => !exercise.isPinned);
    const pinnedCount = mode === "pick" ? (firstUnpinned === -1 ? rows.length : firstUnpinned) : 0;
    if (mode === "pick" && pinnedCount === rows.length && library.hasMore) return rows;
    return [
      ...rows.slice(0, pinnedCount),
      { kind: "header", key: "recent", title: t("exercise__recent") },
      ...recent.map((exercise): ListItem => ({
        kind: "row",
        key: `recent-${exercise.id}`,
        exercise,
      })),
      ...(pinnedCount < rows.length
        ? [{ kind: "header" as const, key: "all", title: t("exercise__all") }]
        : []),
      ...rows.slice(pinnedCount),
    ];
  }, [library.rows, library.recent, library.hasMore, mode, showRecent, t]);

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
          onSetPinned={mode === "pick" ? setExercisePinned : undefined}
          onArchive={rowArchive}
          onRestore={rowRestore}
        />
      ),
    [mode, selectedOrder, disabledIds, onRowPress, rowArchive, rowRestore, setExercisePinned],
  );

  const clearFilters = useCallback(
    () => setFilters((current) => ({ ...withoutFacets(current), search: "" })),
    [],
  );

  const selectMapMuscle = useCallback(
    (muscles: readonly MuscleGroup[], primaryDetail: MuscleDetail | null) =>
      setFilters((current) => ({ ...current, muscles, primaryDetail, includeSecondary: false })),
    [],
  );

  const status = library.status;
  const stateView: ReactNode = (() => {
    if (status === "error") return <LoadFailedState onRetry={library.retry} />;
    if (library.isLoading) return null;
    if (status === "first-sync") return <LibrarySetup />;
    if (status === "offline-unsynced") return <OfflineState onCreate={onCreate} />;
    if (library.rows.length > 0) return null;
    if (
      filters.show === "archived" &&
      !searching &&
      !hasActiveFilters({ ...filters, show: "all" })
    ) {
      return (
        <ArchivedEmptyState
          onBrowse={() =>
            setFilters((current) => ({ ...withoutFacets(current), search: "", show: "all" }))
          }
        />
      );
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

  return (
    <SwipeGroup>
      {onCreate && mode === "browse" ? <NewExerciseAction onCreate={onCreate} /> : null}
      <Page
        title={title ?? t("exercise__title")}
        stickyTitle={mode === "browse"}
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
              <View className="flex-row items-center gap-2">
                <ScrollView
                  className="min-w-0 flex-1"
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerClassName="h-11 flex-row items-center gap-2"
                >
                  <FilterPill
                    label={t("exercise__filters_title")}
                    active={hasActiveFilters(filters)}
                    onPress={() => setFiltersOpen(true)}
                  />
                  <Button
                    size="sm"
                    variant={filters.pinnedOnly ? "secondary" : "ghost"}
                    className="h-9 rounded-full"
                    accessibilityState={{ selected: filters.pinnedOnly }}
                    onPress={() =>
                      setFilters((current) => ({ ...current, pinnedOnly: !current.pinnedOnly }))
                    }
                  >
                    <Button.Label>{t("exercise__pinned")}</Button.Label>
                  </Button>
                  <FilterChips chips={chips} />
                  {chips.length > 0 || filters.pinnedOnly ? (
                    <Button variant="ghost" onPress={() => setFilters(withoutFacets)}>
                      <Button.Label>{t("exercise__clear_filters")}</Button.Label>
                    </Button>
                  ) : null}
                </ScrollView>
                {library.total !== null && status === "ready" ? (
                  <Text className="max-w-[45%] text-right font-normal text-caption tabular-nums text-muted">
                    {t("exercise__count", { count: library.total })}
                  </Text>
                ) : null}
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
                  {mode === "browse" ? (
                    <BodyMapFilter
                      muscles={filters.muscles}
                      detail={filters.primaryDetail}
                      onSelect={selectMapMuscle}
                    />
                  ) : null}
                  {showSwapSuggestions ? listHeader : null}
                </View>
              </View>
            }
            ListEmptyComponent={stateView}
            ListFooterComponent={rowsAboveState ? stateView : null}
          />
        )}
      </Page>
      <FilterSheet
        isOpen={filtersOpen}
        onOpenChange={setFiltersOpen}
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
