import { SET_FIELDS, addsLoad, type SetField, resolveExerciseUnit } from "@workspace/shared";
import { Plus } from "phosphor-react-native";
import { memo, useCallback, useMemo, useRef } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  measure,
  ReduceMotion,
  useAnimatedRef,
  withTiming,
  type AnimatedRef,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
} from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { SwipeGroup } from "@/platform/ui/swipe-row";

import { showsRecord } from "@/session/store/session-store";
import { useSessionStore } from "@/session/store/session-store-context";
import { SetRowView } from "./set-row";

type RegionVisible = (offset: number, height: number) => boolean;

const ENTER_TIMING = { duration: 200, reduceMotion: ReduceMotion.Never };
const EXIT_TIMING = { duration: 150, reduceMotion: ReduceMotion.Never };

/** Layout animation origins are relative to the native grid, which stays mounted for set edits. */
function visibleInGrid(viewport: AnimatedRef<View>, grid: AnimatedRef<View>, y: number, h: number) {
  "worklet";
  const view = measure(viewport);
  const parent = measure(grid);
  if (!view || !parent) return false;
  const top = parent.pageY + y;
  return top < view.pageY + view.height && top + h > view.pageY;
}

/** What the rows of one exercise do; all of them keep their identity. */
export type SetHandlers = {
  onCell: (setId: string, field: SetField) => void;
  onTick: (setId: string) => void;
  onKind: (setId: string) => void;
  /** Long-press on a set's badge: this exercise's max load, step and setup note. */
  onLimits: (setId: string) => void;
  onEffort: (setId: string) => void;
  onPrevious: (setId: string) => void;
  onCopySets: (setId: string, mode: "previous" | "remaining") => void;
  onRemoveSet: (setId: string) => Promise<boolean>;
  onTimer: (setId: string) => void;
  /** Lets the screen scroll a row into view above the keypad. */
  registerRow: (setId: string) => (node: View | null) => void;
};

/**
 * One set: it reads its own set, its lookups, the keypad's draft and the flags it draws from the
 * Session's store, so a tick or a keystroke redraws this row and no other.
 */
const SetRowItem = memo(function SetRowItem({
  exerciseId,
  setId,
  handlers,
  isRowRegionVisible,
  entering,
  exiting,
}: {
  exerciseId: string;
  setId: string;
  handlers: SetHandlers;
  isRowRegionVisible: RegionVisible;
  entering?: (values: EntryAnimationsValues) => ReturnType<typeof enterSet>;
  exiting?: (values: ExitAnimationsValues) => ReturnType<typeof exitSet>;
}) {
  "use no memo"; // The viewport test samples the list's current scroll position.
  const { t } = useTranslation();
  const data = useSessionStore(
    useShallow((state) => {
      const exercise = state.exercises.get(exerciseId);
      const view = state.views.get(exerciseId);
      return {
        set: state.setsById.get(setId),
        row: view?.rows.get(setId),
        type: exercise?.type,
        logEffort: exercise?.logEffort ?? false,
        historyReady: view?.historyReady ?? false,
        current: state.currentSetId === setId,
        record: showsRecord(state, setId) ? (state.setsById.get(setId)?.completedAt ?? null) : null,
        refusal: state.refusal?.setId === setId ? state.refusal : null,
        cell: state.cell?.setId === setId ? state.cell : null,
        raw: state.cell?.setId === setId ? state.raw : "",
        fresh: state.cell?.setId === setId ? state.fresh : true,
        unit: resolveExerciseUnit(state.inputs.unit, exercise?.unit),
        display: state.inputs.display,
        effortScale: state.ui.effortScale,
        readOnly: state.ui.readOnly,
        editingFinished: state.session.finishedAt !== null,
      };
    }),
  );
  const { registerRow } = handlers;
  const register = useMemo(() => registerRow(setId), [registerRow, setId]);
  const layout = useRef({ y: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    layout.current = { y, height };
  }, []);
  const { set, row, type, cell, raw, fresh } = data;
  const entry = useMemo(() => (cell ? { cell, raw, fresh } : null), [cell, raw, fresh]);
  if (!set || !row || !type) return null;
  // Only a set added while the grid is open enters and one removed fades out: the grid sits in a
  // LayoutAnimationConfig that skips both for its first render and for the whole grid closing.
  return (
    <Animated.View ref={register} onLayout={onLayout} entering={entering} exiting={exiting}>
      <SetRowView
        editingFinished={data.editingFinished}
        set={set}
        type={type}
        row={row}
        logEffort={data.logEffort}
        historyReady={data.historyReady}
        unit={data.unit}
        display={data.display}
        effortScale={data.effortScale}
        entry={entry}
        refusal={data.refusal}
        current={data.current}
        record={data.record}
        animate={
          entering !== undefined && isRowRegionVisible(layout.current.y, layout.current.height)
        }
        readOnly={data.readOnly}
        onCell={handlers.onCell}
        onTick={handlers.onTick}
        onKind={handlers.onKind}
        onLimits={handlers.onLimits}
        onEffort={handlers.onEffort}
        onPrevious={handlers.onPrevious}
        onCopySets={handlers.onCopySets}
        onRemove={handlers.onRemoveSet}
        onTimer={handlers.onTimer}
      />
      {row.optional ? (
        <Text className="font-normal px-3 pb-1 text-caption text-muted">
          {t("lighter__optional")}
        </Text>
      ) : null}
    </Animated.View>
  );
});

/**
 * The sets of one exercise: a header over the columns, then a row for each set, then the "Add set" text button.
 * It redraws when the exercise's columns or its list of sets change; each row follows its own set.
 */
export const SetGrid = memo(function SetGrid({
  exerciseId,
  handlers,
  onAddSet,
  animate,
  viewport,
  isBodyRegionVisible,
}: {
  exerciseId: string;
  handlers: SetHandlers;
  onAddSet: (exerciseId: string) => void;
  animate: boolean;
  viewport: AnimatedRef<View>;
  isBodyRegionVisible: RegionVisible;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const layout = useSessionStore(
    useShallow((state) => {
      const exercise = state.exercises.get(exerciseId);
      return {
        title: exercise?.title,
        type: exercise?.type,
        logEffort: exercise?.logEffort ?? false,
        setIds: state.views.get(exerciseId)?.setIds,
        unit: resolveExerciseUnit(state.inputs.unit, exercise?.unit),
        display: state.inputs.display,
        effortScale: state.ui.effortScale,
        readOnly: state.ui.readOnly,
        editingFinished: state.session.finishedAt !== null,
      };
    }),
  );
  const grid = useAnimatedRef<View>();
  const gridTop = useRef<number | null>(null);
  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    gridTop.current = event.nativeEvent.layout.y;
  }, []);
  const isRowRegionVisible = useCallback<RegionVisible>(
    (offset, height) => {
      const top = gridTop.current;
      return top !== null && height > 0 && isBodyRegionVisible(top + offset, height);
    },
    [isBodyRegionVisible],
  );
  const entering = useCallback(
    (values: EntryAnimationsValues) => {
      "worklet";
      return enterSet(visibleInGrid(viewport, grid, values.targetOriginY, values.targetHeight));
    },
    [grid, viewport],
  );
  const exiting = useCallback(
    (values: ExitAnimationsValues) => {
      "worklet";
      return exitSet(visibleInGrid(viewport, grid, values.currentOriginY, values.currentHeight));
    },
    [grid, viewport],
  );
  const { type, logEffort, setIds, unit, display, effortScale, readOnly, editingFinished } = layout;
  if (!type || !setIds) return null;
  const fields: readonly SetField[] = SET_FIELDS[type];
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const showsEffort = logEffort && fields.includes("reps");
  const header = (field: SetField): string => {
    switch (field) {
      case "weight":
        return t(addsLoad(type) ? "training__field_added_weight" : "training__field_weight", {
          unit: unitName,
        });
      case "reps":
        return t("training__field_reps");
      case "duration":
        return t("training__field_duration");
      case "distance":
        return display.distanceUnit === "m"
          ? t("training__col_distance", { unit: t("training__unit_m") })
          : t("exercise__metric_distance");
      case "floors":
        return t("training__field_floors");
      case "steps":
        return t("training__field_steps");
    }
  };

  return (
    <SwipeGroup>
      <View ref={grid} collapsable={false} onLayout={onGridLayout} className="gap-1">
        <View className="flex-row items-center gap-1.5 px-1">
          <Text className="font-normal w-10 text-center text-caption text-muted">
            {t("training__col_set")}
          </Text>
          <Text className="font-normal min-w-0 flex-[1.3] text-center text-caption text-muted">
            {t("session__col_previous")}
          </Text>
          {fields.map((field) => (
            <Text
              key={field}
              numberOfLines={1}
              className={`font-normal min-w-0 text-center text-caption text-muted ${field === "reps" ? "flex-[1.2]" : "flex-1"}`}
            >
              {header(field)}
            </Text>
          ))}
          {showsEffort ? (
            <Text
              numberOfLines={1}
              className="font-normal w-11 text-center text-caption text-muted"
            >
              {t(effortScale === "rpe" ? "training__effort_rpe" : "training__effort_rir")}
            </Text>
          ) : null}
          {editingFinished ? null : <View className="w-11" />}
        </View>
        {setIds.map((setId) => (
          <SetRowItem
            key={setId}
            exerciseId={exerciseId}
            setId={setId}
            handlers={handlers}
            isRowRegionVisible={isRowRegionVisible}
            entering={animate ? entering : undefined}
            exiting={animate ? exiting : undefined}
          />
        ))}
      </View>
      {readOnly ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("session__add_set_to", {
            title: layout.title || t("training__exercise_missing"),
          })}
          onPress={() => onAddSet(exerciseId)}
          className="mt-1 min-h-11 flex-row items-center gap-2 self-start rounded-lg px-3 active:bg-default"
        >
          <Plus size={18} color={subtle} />
          <Text className="font-medium text-label text-muted">{t("session__add_set")}</Text>
        </Pressable>
      )}
    </SwipeGroup>
  );
});

function enterSet(visible: boolean) {
  "worklet";
  return visible
    ? {
        initialValues: { opacity: 0, transform: [{ translateY: -8 }] },
        animations: {
          opacity: withTiming(1, ENTER_TIMING),
          transform: [{ translateY: withTiming(0, ENTER_TIMING) }],
        },
      }
    : { initialValues: { opacity: 1 }, animations: {} };
}

function exitSet(visible: boolean) {
  "worklet";
  return {
    initialValues: { opacity: 1 },
    animations: visible ? { opacity: withTiming(0, EXIT_TIMING) } : {},
  };
}
