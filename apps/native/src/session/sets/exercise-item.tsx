import { SESSION_LIMITS, type SupersetPlace } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { memo, useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";

import { useTranslation } from "@/platform/i18n";
import { InlineNote, RestPicker } from "@/training";

import { StalledNote } from "@/exercise";
import { useSessionStore } from "@/session/store/session-store-context";
import { ProgressionChip } from "./progression-chip";
import { ExerciseRow } from "./exercise-row";
import { SetGrid, type SetHandlers } from "./set-grid";

/** What an exercise does, apart from its sets' own handlers; all of them keep their identity. */
export type ExerciseHandlers = SetHandlers & {
  onView: (exerciseId: string) => void;
  onMenu: (exercise: SessionExerciseDetail) => void;
  onAddSet: (exerciseId: string) => void;
  onReorder: () => void;
  onNote: (exerciseId: string, note: string | null) => void;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
  /** The exercise was laid out again (its sets grew or shrank). */
  onLayout: (exerciseId: string) => void;
};

/**
 * One expanded exercise. It reads its header (name, count, summary, suggestion) from the Session's
 * store, so a tick in it redraws its header; its sets are rows that follow their own set.
 */
export const ExerciseItem = memo(function ExerciseItem({
  exerciseId,
  handlers,
}: {
  exerciseId: string;
  handlers: ExerciseHandlers;
}) {
  const data = useSessionStore(
    useShallow((state) => {
      const view = state.views.get(exerciseId);
      return {
        exercise: state.exercises.get(exerciseId),
        suggestion: view?.suggestion ?? null,
        stall: view?.stall ?? null,
        progress: view?.progress ?? "",
        summary: view?.summary ?? "",
        place: state.places.get(exerciseId) ?? "none",
        unit: state.inputs.unit,
        readOnly: state.ui.readOnly,
      };
    }),
  );
  const { exercise, suggestion, stall, unit, place, readOnly } = data;
  const progression = useMemo(
    () => (suggestion ? <ProgressionChip suggestion={suggestion} unit={unit} /> : null),
    [suggestion, unit],
  );
  if (!exercise) return null;
  return (
    <View onLayout={() => handlers.onLayout(exerciseId)}>
      <ExerciseRow
        exercise={exercise}
        progression={progression}
        place={place}
        progress={data.progress}
        summary={data.summary}
        readOnly={readOnly}
        onView={handlers.onView}
        onMenu={handlers.onMenu}
        onReorder={handlers.onReorder}
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
          id={exercise.id}
          note={exercise.note}
          restSeconds={exercise.restSeconds}
          place={place}
          readOnly={readOnly}
          onNote={handlers.onNote}
          onRest={handlers.onRest}
        />
        <SetGrid exerciseId={exerciseId} handlers={handlers} onAddSet={handlers.onAddSet} />
      </ExerciseRow>
    </View>
  );
});

/**
 * The note and the rest timer under an open exercise's name: the note is edited in place and saved
 * when the field is left; the rest timer is a link to its picker.
 */
const ExerciseBody = memo(function ExerciseBody({
  id,
  note,
  restSeconds,
  place,
  readOnly,
  onNote,
  onRest,
}: {
  id: string;
  note: string | null;
  restSeconds: number | null;
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
    if (!readOnly && typed !== undefined && typed !== note) onNote(id, typed);
  };
  const saveOnUnmount = useRef(saveNote);
  saveOnUnmount.current = saveNote;
  useEffect(() => () => saveOnUnmount.current(), []);
  const showsRest = !readOnly && place !== "first" && place !== "middle";
  return (
    <View>
      {readOnly ? (
        note ? (
          <Text className="font-normal py-2 text-body text-muted">{note}</Text>
        ) : null
      ) : (
        <InlineNote
          label={t("training__pinned_note")}
          value={note}
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
          value={restSeconds}
          group={place === "last"}
          onChange={(next) => onRest(id, next)}
        />
      ) : null}
    </View>
  );
});
