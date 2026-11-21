import {
  SET_FIELDS,
  addsLoad,
  optionalSetIndexes,
  type EffortScale,
  type Ghosts,
  type LoggedSet,
  type SetField,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { Plus } from "phosphor-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { chipTexts } from "@/training";

import { copySetUpdates } from "@/session/logging/copy-sets";
import { SetRow, type ActiveEntry, type Refusal } from "./set-row";

import type { DisplayUnits } from "@/session/logging/set-values";

/**
 * The sets of one exercise: a header over the columns, then a row for each set, then "+ Add set".
 * All state lives in the logging hook; a row gets only what it draws.
 */
export const SetGrid = memo(function SetGrid({
  exercise,
  lighter,
  historyReady,
  editingFinished,
  inlineTimer,
  entry,
  refusal,
  previousOf,
  ghostsFor,
  onCell,
  onTick,
  onPrevious,
  onCopySets,
  onTimer,
  onAddSet,
  unit,
  display,
  effortScale,
  readOnly,
  onKind,
  onEffort,
  onRemoveSet,
  addedSetIds,
  onAddedSetShown,
  registerRow,
}: {
  exercise: SessionExerciseDetail;
  /** A Lighter week is running: sets past the first half are optional. */
  lighter: boolean;
  /** Previous values of this exercise have loaded. */
  historyReady: boolean;
  editingFinished: boolean;
  inlineTimer: boolean;
  /** The keypad's cell, only when it is in this exercise. */
  entry: ActiveEntry | null;
  /** A refused tick, only when it is in this exercise. */
  refusal: Refusal | null;
  previousOf: (setId: string) => LoggedSet | null;
  ghostsFor: (setId: string) => Ghosts;
  onCell: (setId: string, field: SetField) => void;
  onTick: (setId: string) => void;
  onPrevious: (setId: string) => void;
  onCopySets: (setId: string, mode: "previous" | "remaining") => void;
  onTimer: (setId: string) => void;
  onAddSet: (exerciseId: string) => void;
  unit: WeightUnit;
  display: DisplayUnits;
  effortScale: EffortScale;
  readOnly: boolean;
  onKind: (setId: string) => void;
  onEffort: (setId: string) => void;
  onRemoveSet: (setId: string) => Promise<boolean>;
  addedSetIds: ReadonlySet<string>;
  onAddedSetShown: (setId: string) => void;
  /** Lets the screen scroll a row into view above the keypad. */
  registerRow: (setId: string) => (node: View | null) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const fields: readonly SetField[] = SET_FIELDS[exercise.type];
  const optional = lighter
    ? optionalSetIndexes(exercise.sets.map((set) => set.kind))
    : new Set<number>();
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const showsEffort = exercise.logEffort && fields.includes("reps");
  const badges = chipTexts(
    exercise.sets.map((set) => ({ kind: set.kind })),
    {
      working: "",
      warmup: t("training__chip_warmup"),
      drop: t("training__chip_drop"),
      failure: t("training__chip_failure"),
      top: t("training__chip_top"),
      backoff: t("training__chip_backoff"),
      myo: t("training__chip_myo"),
    },
  );
  const header = (field: SetField): string => {
    switch (field) {
      case "weight":
        return t(
          addsLoad(exercise.type) ? "training__field_added_weight" : "training__field_weight",
          {
            unit: unitName,
          },
        );
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
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5 border border-transparent px-1">
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
        {exercise.sets.map((set, index) => (
          <View
            key={set.id}
            ref={registerRow(set.id)}
            collapsable={false}
            style={{ opacity: optional.has(index) && set.completedAt === null ? 0.55 : 1 }}
          >
            <SetRow
              editingFinished={editingFinished}
              inlineTimer={inlineTimer}
              set={set}
              type={exercise.type}
              badge={badges[index] ?? String(index + 1)}
              number={index + 1}
              logEffort={exercise.logEffort}
              historyReady={historyReady}
              previous={previousOf(set.id)}
              ghosts={ghostsFor(set.id)}
              unit={unit}
              display={display}
              effortScale={effortScale}
              entry={entry?.cell.setId === set.id ? entry : null}
              refusal={refusal?.setId === set.id ? refusal : null}
              readOnly={readOnly}
              canRemove={exercise.sets.length > 1}
              canCopyPrevious={
                copySetUpdates(exercise, set.id, "previous", previousOf(set.id)).length > 0
              }
              canFillRemaining={copySetUpdates(exercise, set.id, "remaining", null).length > 0}
              onCell={onCell}
              onTick={onTick}
              onKind={onKind}
              onEffort={onEffort}
              onPrevious={onPrevious}
              onCopySets={onCopySets}
              onRemove={onRemoveSet}
              added={addedSetIds.has(set.id)}
              onAddedShown={onAddedSetShown}
              onTimer={onTimer}
            />
            {optional.has(index) && set.completedAt === null ? (
              <Text className="font-normal px-3 pb-1 text-caption text-muted">
                {t("lighter__optional")}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {readOnly ? null : (
        <Button variant="secondary" onPress={() => onAddSet(exercise.id)}>
          <Plus size={20} color={subtle} />
          <Button.Label>{t("session__add_set")}</Button.Label>
        </Button>
      )}
    </SwipeGroup>
  );
});
