import {
  SESSION_LIMITS,
  type EffortScale,
  type Ghosts,
  type Progression,
  type LoggedSet,
  type SetField,
  type SupersetPlace,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { memo, useRef } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { InlineNote, RestPicker } from "@/training";
import type { WeightUnit } from "@workspace/shared";

import { ProgressionChip } from "./progression-chip";
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
  suggestion,
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
  suggestion: Progression | null;
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
  onNote: (exerciseId: string, note: string | null) => void;
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
      progression={suggestion ? <ProgressionChip suggestion={suggestion} unit={unit} /> : null}
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

/**
 * The note and the rest timer under an open exercise's name: the note is edited in place and saved
 * when the field is left; the rest timer is a link to its picker.
 */
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
  onNote: (exerciseId: string, note: string | null) => void;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
}) {
  const { t } = useTranslation();
  // What was typed since the field was last left; undefined when nothing was typed.
  const draft = useRef<string | null | undefined>(undefined);
  const showsRest = !readOnly && place !== "first" && place !== "middle";
  return (
    <View>
      {readOnly ? (
        entry.note ? (
          <Text className="py-2 text-body text-muted">{entry.note}</Text>
        ) : null
      ) : (
        <InlineNote
          label={t("training__pinned_note")}
          value={entry.note}
          placeholder={t("session__note_placeholder")}
          maxLength={SESSION_LIMITS.noteMax}
          onText={(text) => {
            draft.current = text;
          }}
          onDone={() => {
            const typed = draft.current;
            draft.current = undefined;
            if (typed !== undefined && typed !== entry.note) onNote(entry.id, typed);
          }}
        />
      )}
      {showsRest ? (
        <RestPicker
          link
          value={entry.restSeconds}
          group={place === "last"}
          onChange={(restSeconds) => onRest(entry.id, restSeconds)}
        />
      ) : null}
    </View>
  );
}
