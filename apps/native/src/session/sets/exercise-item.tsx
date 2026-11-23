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
import { memo, useEffect, useRef } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { InlineNote, RestPicker } from "@/training";
import type { WeightUnit } from "@workspace/shared";

import { StalledNote } from "@/exercise";
import type { StallInfo } from "@/session/logging/use-logging-state";
import { ProgressionChip } from "./progression-chip";
import { ExerciseRow } from "./exercise-row";
import type { ActiveEntry, Refusal } from "./set-row";
import { SetGrid } from "./set-grid";

import type { DisplayUnits } from "@/session/logging/set-values";

/**
 * One expanded exercise. A keystroke updates the grid that holds the edited cell.
 */
export const ExerciseItem = memo(function ExerciseItem({
  exercise,
  suggestion,
  stall,
  lighter,
  place,
  progress,
  summary,
  readOnly,
  unit,
  display,
  effortScale,
  historyReady,
  editingFinished,
  inlineTimer,
  entry,
  refusal,
  currentSetId,
  previousOf,
  ghostsFor,
  onView,
  onMenu,
  onAddSet,
  onReorder,
  onNote,
  onRest,
  onCell,
  onTick,
  onKind,
  onEffort,
  onPrevious,
  onCopySets,
  onRemoveSet,
  onTimer,
  registerRow,
}: {
  exercise: SessionExerciseDetail;
  suggestion: Progression | null;
  /** A stalled lift's note, when it shows. */
  stall: StallInfo | null;
  /** A Lighter week is running: about half the sets are optional. */
  lighter: boolean;
  place: SupersetPlace;
  progress: string;
  summary: string;
  readOnly: boolean;
  unit: WeightUnit;
  display: DisplayUnits;
  effortScale: EffortScale;
  historyReady: boolean;
  editingFinished: boolean;
  /** Whether duration sets show their start/stop button. */
  inlineTimer: boolean;
  entry: ActiveEntry | null;
  refusal: Refusal | null;
  currentSetId: string | null;
  previousOf: (setId: string) => LoggedSet | null;
  ghostsFor: (setId: string) => Ghosts;
  onView: (exerciseId: string) => void;
  onMenu: (exercise: SessionExerciseDetail) => void;
  onAddSet: (exerciseId: string) => void;
  onReorder: () => void;
  onNote: (exerciseId: string, note: string | null) => void;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
  onCell: (setId: string, field: SetField) => void;
  onTick: (setId: string) => void;
  onKind: (setId: string) => void;
  onEffort: (setId: string) => void;
  onPrevious: (setId: string) => void;
  onCopySets: (setId: string, mode: "previous" | "remaining") => void;
  onRemoveSet: (setId: string) => Promise<boolean>;
  onTimer: (setId: string) => void;
  registerRow: (setId: string) => (node: View | null) => void;
}) {
  return (
    <ExerciseRow
      exercise={exercise}
      progression={suggestion ? <ProgressionChip suggestion={suggestion} unit={unit} /> : null}
      place={place}
      progress={progress}
      summary={summary}
      readOnly={readOnly}
      onView={onView}
      onMenu={onMenu}
      onReorder={onReorder}
    >
      {stall ? (
        <StalledNote
          exerciseId={exercise.exerciseId}
          latestSessionId={stall.latestSessionId}
          count={stall.count}
          applied={stall.applied}
        />
      ) : null}
      <ExerciseBody
        entry={exercise}
        place={place}
        readOnly={readOnly}
        onNote={onNote}
        onRest={onRest}
      />
      <SetGrid
        exercise={exercise}
        lighter={lighter}
        historyReady={historyReady}
        editingFinished={editingFinished}
        inlineTimer={inlineTimer}
        entry={entry}
        refusal={refusal}
        currentSetId={currentSetId}
        previousOf={previousOf}
        ghostsFor={ghostsFor}
        unit={unit}
        display={display}
        effortScale={effortScale}
        readOnly={readOnly}
        onCell={onCell}
        onTick={onTick}
        onKind={onKind}
        onEffort={onEffort}
        onPrevious={onPrevious}
        onCopySets={onCopySets}
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
  const saveNote = () => {
    const typed = draft.current;
    draft.current = undefined;
    if (!readOnly && typed !== undefined && typed !== entry.note) onNote(entry.id, typed);
  };
  const saveOnUnmount = useRef(saveNote);
  saveOnUnmount.current = saveNote;
  useEffect(() => () => saveOnUnmount.current(), []);
  const showsRest = !readOnly && place !== "first" && place !== "middle";
  return (
    <View>
      {readOnly ? (
        entry.note ? (
          <Text className="font-normal py-2 text-body text-muted">{entry.note}</Text>
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
          onDone={saveNote}
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
