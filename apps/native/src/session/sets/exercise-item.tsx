import { SESSION_LIMITS, type SupersetPlace } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NotePencil } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { LayoutAnimationConfig } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { InlineNote, RestPicker } from "@/training";
import { allTicked } from "@/session/finish/summary";

import { StalledNote } from "@/exercise";
import { useSessionStore } from "@/session/store/session-store-context";
import { ProgressionChip } from "./progression-chip";
import { ExerciseRow } from "./exercise-row";
import { SetGrid, type SetHandlers } from "./set-grid";

/** What an exercise does, apart from its sets' own handlers; all of them keep their identity. */
export type ExerciseHandlers = SetHandlers & {
  onView: (exerciseId: string) => void;
  /** Opens a closed exercise, closes an open one. */
  onToggle: (exerciseId: string) => void;
  onMenu: (exercise: SessionExerciseDetail) => void;
  onAddSet: (exerciseId: string) => void;
  onReorder: () => void;
  onNote: (exerciseId: string, note: string | null) => void;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
  /** The exercise was laid out again (its sets grew or shrank). */
  onLayout: (exerciseId: string) => void;
};

/**
 * One exercise of the accordion. It reads its header (name, count, summary, suggestion) and whether
 * it is open from the Session's store, so a tick in it redraws its header; its sets are rows that
 * follow their own set. Closed, it builds no body at all.
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
        expanded: state.expanded.has(exerciseId),
        done: allTicked(state.exercises.get(exerciseId)?.sets ?? []),
      };
    }),
  );
  const { exercise, suggestion, stall, unit, place, readOnly, expanded } = data;
  // Once this row has been seen closed, opening it fades its body in. A row that mounts open (the
  // screen opening, or the list mounting it while scrolling) shows it at once.
  const [seenClosed, setSeenClosed] = useState(false);
  if (!expanded && !seenClosed) setSeenClosed(true);
  const progression = useMemo(
    () => (suggestion ? <ProgressionChip suggestion={suggestion} unit={unit} /> : null),
    [suggestion, unit],
  );
  if (!exercise) return null;
  return (
    <View className={expanded ? "pb-4" : "pb-1"} onLayout={() => handlers.onLayout(exerciseId)}>
      <ExerciseRow
        exercise={exercise}
        progression={progression}
        place={place}
        progress={data.progress}
        summary={data.summary}
        expanded={expanded}
        done={data.done}
        readOnly={readOnly}
        animateOpen={seenClosed}
        onView={handlers.onView}
        onToggle={handlers.onToggle}
        onMenu={handlers.onMenu}
        onReorder={handlers.onReorder}
      >
        {expanded ? (
          <LayoutAnimationConfig skipEntering skipExiting>
            <View className="gap-3">
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
            </View>
          </LayoutAnimationConfig>
        ) : null}
      </ExerciseRow>
    </View>
  );
});

/**
 * The row of chips under an open exercise's name (Rest, Note) and the note itself. The note is
 * edited in place and saved when the field is left; it is always shown while it has text, and
 * the Note chip reveals the field (focused) while it has none. Rest opens its picker.
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
  const subtle = useSubtleColor();
  const [noteOpen, setNoteOpen] = useState(false);
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
  const showsNote = note !== null || noteOpen;
  const showsNoteChip = !readOnly && !showsNote;
  return (
    <View>
      {showsRest || showsNoteChip ? (
        <View className="flex-row flex-wrap items-center gap-1">
          {showsRest ? (
            <RestPicker
              chip
              value={restSeconds}
              group={place === "last"}
              onChange={(next) => onRest(id, next)}
            />
          ) : null}
          {showsNoteChip ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("session__add_note")}
              accessibilityState={{ expanded: false }}
              onPress={() => {
                haptic.tick();
                setNoteOpen(true);
              }}
              className="min-h-11 flex-row items-center gap-1.5 self-start rounded-full px-2 active:bg-default"
            >
              <NotePencil size={16} color={subtle} />
              <Text className="font-medium text-label text-muted">{t("session__note_chip")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {showsNote ? (
        readOnly ? (
          <Text className="font-normal py-2 text-body text-muted">{note}</Text>
        ) : (
          <InlineNote
            label={t("session__note_chip")}
            value={note}
            placeholder={t("session__note_placeholder")}
            maxLength={SESSION_LIMITS.noteMax}
            autoFocus={noteOpen && note === null}
            onText={(text) => {
              draft.current = text;
            }}
            onDone={() => {
              const typed = draft.current;
              saveNote();
              // An empty note goes back to its chip.
              if ((typed === undefined ? note : typed) === null) setNoteOpen(false);
            }}
          />
        )
      ) : null}
    </View>
  );
});
