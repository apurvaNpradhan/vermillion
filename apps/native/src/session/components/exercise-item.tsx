import type { EffortScale, Ghosts, LoggedSet, SetField, SupersetPlace } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { memo } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { RestPicker } from "@/training";
import type { WeightUnit } from "@workspace/shared";

import { ExerciseRow } from "./exercise-row";
import type { ActiveEntry, Refusal } from "./set-row";
import { SetGrid } from "./set-grid";

/**
 * One exercise of the accordion with its body. Memoized on what it draws, so opening another
 * exercise re-renders only the two rows whose `open` changed, and a keystroke only the grid that
 * holds the keypad's cell.
 */
export const ExerciseItem = memo(function ExerciseItem({
  exercise,
  place,
  open,
  warm,
  dragging,
  progress,
  summary,
  showAddSet,
  readOnly,
  unit,
  effortScale,
  historyReady,
  editingFinished,
  entry,
  refusal,
  previousOf,
  ghostsFor,
  onView,
  onToggle,
  onMenu,
  onAddSet,
  onNote,
  onRest,
  onCell,
  onTick,
  onKind,
  onEffort,
  onPrevious,
  onRemoveSet,
  onTimer,
  registerRow,
}: {
  exercise: SessionExerciseDetail;
  place: SupersetPlace;
  open: boolean;
  warm: boolean;
  dragging: boolean;
  progress: string;
  summary: string;
  showAddSet: boolean;
  readOnly: boolean;
  unit: WeightUnit;
  effortScale: EffortScale;
  historyReady: boolean;
  editingFinished: boolean;
  entry: ActiveEntry | null;
  refusal: Refusal | null;
  previousOf: (setId: string) => LoggedSet | null;
  ghostsFor: (setId: string) => Ghosts;
  onView: (exerciseId: string) => void;
  onToggle: (exerciseId: string) => void;
  onMenu: (exercise: SessionExerciseDetail) => void;
  onAddSet: (exerciseId: string) => void;
  onNote: (exercise: SessionExerciseDetail) => void;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
  onCell: (setId: string, field: SetField) => void;
  onTick: (setId: string) => void;
  onKind: (setId: string) => void;
  onEffort: (setId: string) => void;
  onPrevious: (setId: string) => void;
  onRemoveSet: (setId: string) => void;
  onTimer: (setId: string) => void;
  registerRow: (setId: string) => (node: View | null) => void;
}) {
  return (
    <ExerciseRow
      exercise={exercise}
      place={place}
      open={open}
      warm={warm}
      dragging={dragging}
      progress={progress}
      summary={summary}
      showAddSet={showAddSet}
      readOnly={readOnly}
      onView={onView}
      onToggle={onToggle}
      onMenu={onMenu}
      onAddSet={onAddSet}
    >
      <ExerciseBody
        entry={exercise}
        place={place}
        readOnly={readOnly}
        onNote={onNote}
        onRest={onRest}
      />
      <SetGrid
        exercise={exercise}
        historyReady={historyReady}
        editingFinished={editingFinished}
        entry={entry}
        refusal={refusal}
        previousOf={previousOf}
        ghostsFor={ghostsFor}
        unit={unit}
        effortScale={effortScale}
        readOnly={readOnly}
        onCell={onCell}
        onTick={onTick}
        onKind={onKind}
        onEffort={onEffort}
        onPrevious={onPrevious}
        onRemoveSet={onRemoveSet}
        onTimer={onTimer}
        onAddSet={onAddSet}
        registerRow={registerRow}
      />
    </ExerciseRow>
  );
});

/** The pinned note and rest chip at the top of an open exercise. */
function ExerciseBody({
  entry,
  place,
  readOnly,
  onNote,
  onRest,
}: {
  entry: SessionExerciseDetail;
  place: SupersetPlace;
  readOnly: boolean;
  onNote: (exercise: SessionExerciseDetail) => void;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      {entry.note ? (
        <Text
          accessibilityLabel={t("session__note_label", { note: entry.note })}
          className="px-1 text-body text-muted"
          onPress={readOnly ? undefined : () => onNote(entry)}
        >
          {entry.note}
        </Text>
      ) : null}
      {readOnly || place === "first" || place === "middle" ? null : (
        <RestPicker
          value={entry.restSeconds}
          group={place === "last"}
          onChange={(restSeconds) => onRest(entry.id, restSeconds)}
        />
      )}
    </View>
  );
}
