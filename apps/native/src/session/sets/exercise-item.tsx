import {
  SET_KIND_KEYS,
  SESSION_LIMITS,
  latestAdjustment,
  suggestionLedger,
  resolveExerciseUnit,
  usesGymHistory,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { LayoutAnimationConfig, type AnimatedRef } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

import { useTranslation } from "@/platform/i18n";
import { InlineNote } from "@/training";
import { allTicked } from "@/session/finish/summary";

import { StalledNote } from "@/exercise";
import { MaxPrompt, OverridePrompt, SetupNoteChip, StepPrompt } from "@/gym";
import { showsRecord } from "@/session/store/session-store";
import { useSessionStore } from "@/session/store/session-store-context";
import { AdjustmentNote } from "./adjustment-note";
import { SuggestionLedgerLine } from "./suggestion-ledger-line";
import { ProgressionSheet, useProgressionNote } from "./progression-chip";
import { ExerciseHeaderActions } from "./exercise-header-actions";
import { ExerciseRow } from "./exercise-row";
import { SetGrid, type SetHandlers } from "./set-grid";
import { HintedSetGrid } from "./hinted-set-grid";

/** A ticked set that loads the stack the way training does: anything but a warm-up. */
function isStepEvidence(kind: SessionExerciseDetail["sets"][number]["kind"]): boolean {
  return kind !== "warmup";
}

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
  onStallDeload: (exerciseId: string, applied: boolean) => void;
  /** Restore the targets a same-day adjustment moved, for the rest of the Session. */
  onUndoAdjustment: (exerciseId: string) => void;
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
  animate,
  viewport,
  isInViewport,
}: {
  exerciseId: string;
  handlers: ExerciseHandlers;
  animate: boolean;
  viewport: AnimatedRef<View>;
  isInViewport: (exerciseId: string, offset: number, height: number) => boolean;
}) {
  "use no memo"; // The viewport test samples the list's current scroll position.
  const { t } = useTranslation();
  const data = useSessionStore(
    useShallow((state) => {
      const view = state.views.get(exerciseId);
      const exercise = state.exercises.get(exerciseId);
      let record: string | null = null;
      if (state.records.size > 0 && exercise) {
        for (const set of exercise.sets) {
          if (showsRecord(state, set.id)) {
            const mark = `${set.completedAt}:${set.id}`;
            if (record === null || mark > record) record = mark;
          }
        }
      }
      return {
        exercise,
        record,
        suggestion: view?.suggestion ?? null,
        rows: view?.rows,
        stall: view?.stall ?? null,
        progress: view?.progress ?? "",
        summary: view?.summary ?? "",
        place: state.places.get(exerciseId) ?? "none",
        unit: resolveExerciseUnit(state.inputs.unit, exercise?.unit),
        unitLabel: state.inputs.unitNames[resolveExerciseUnit(state.inputs.unit, exercise?.unit)],
        gymId: state.inputs.gym.gymId,
        activeSessionId: state.session.finishedAt === null ? state.session.id : null,
        setupNote: exercise
          ? (state.inputs.gym.settingFor(exercise.exerciseId)?.setupNote ?? null)
          : null,
        readOnly: state.ui.readOnly,
        effortScale: state.ui.effortScale,
        expanded: state.expanded.has(exerciseId),
        first: state.exerciseIds[0] === exerciseId,
        done: allTicked(exercise?.sets ?? []),
      };
    }),
  );
  const { exercise, suggestion, stall, unit, place, readOnly, expanded } = data;
  const finishedLedger = useMemo(
    () =>
      exercise && data.activeSessionId === null
        ? suggestionLedger(
            exercise.prescription,
            exercise.sets.map((set) => ({
              id: set.id,
              kind: set.kind,
              completed: set.completedAt !== null,
              weight_kg: set.weightKg,
              reps: set.reps,
            })),
          )
        : null,
    [exercise, data.activeSessionId],
  );
  const adjustment = latestAdjustment(exercise?.prescription);
  const adjustedSet = adjustment && exercise?.sets.find(({ id }) => id === adjustment.setId);
  const adjustedBadge = adjustedSet && data.rows?.get(adjustedSet.id)?.badge;
  const adjustedLabel =
    adjustedSet && adjustedBadge
      ? adjustedSet.kind === "working"
        ? t("session__set_number", { number: adjustedBadge })
        : t(SET_KIND_KEYS[adjustedSet.kind])
      : null;
  // Once this row has been seen closed, opening it fades its body in. A row that mounts open (the
  // screen opening, or the list mounting it while scrolling) shows it at once.
  const [seenClosed, setSeenClosed] = useState(false);
  if (!expanded && !seenClosed) setSeenClosed(true);
  const bodyTop = useRef<number | null>(null);
  const headerHeight = useRef(0);
  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    headerHeight.current = event.nativeEvent.layout.height;
  }, []);
  const onBodyLayout = useCallback((event: LayoutChangeEvent) => {
    bodyTop.current = event.nativeEvent.layout.y;
  }, []);
  const isBodyRegionVisible = useCallback(
    (offset: number, height: number) => {
      const top = bodyTop.current;
      return top !== null && isInViewport(exerciseId, top + offset, height);
    },
    [exerciseId, isInViewport],
  );
  const [reasonOpen, setReasonOpen] = useState(false);
  const openReason = useCallback(() => setReasonOpen(true), []);
  const [noteOpen, setNoteOpen] = useState(false);
  const openNote = useCallback(() => setNoteOpen(true), []);
  if (!expanded && noteOpen) setNoteOpen(false);
  const effortScale = data.effortScale;
  const noteInput = useMemo(
    () =>
      suggestion && exercise
        ? {
            suggestion,
            badges: exercise.sets.map(
              (set, index) => data.rows?.get(set.id)?.badge ?? String(index + 1),
            ),
            unit,
            effortScale,
          }
        : null,
    [suggestion, exercise, data.rows, effortScale, unit],
  );
  const suggestionNote = useProgressionNote(noteInput);
  const hasNote = exercise?.note != null;
  if (!exercise) return null;
  const equipment = exercise.exercise?.equipment ?? "other";
  return (
    <View className={expanded ? "pb-4" : "pb-1"} onLayout={() => handlers.onLayout(exerciseId)}>
      <ExerciseRow
        exercise={exercise}
        suggestion={suggestionNote?.label ?? null}
        onSuggestion={openReason}
        actions={
          readOnly ? null : (
            <ExerciseHeaderActions
              id={exercise.id}
              restSeconds={exercise.restSeconds}
              place={place}
              hasNote={hasNote || noteOpen}
              onRest={handlers.onRest}
              onAddNote={openNote}
            />
          )
        }
        place={place}
        progress={data.progress}
        summary={data.summary}
        expanded={expanded}
        done={data.done}
        readOnly={readOnly}
        animate={animate && isInViewport(exerciseId, 0, headerHeight.current)}
        animateOpen={seenClosed}
        record={data.record}
        onHeaderLayout={onHeaderLayout}
        onBodyLayout={onBodyLayout}
        onView={handlers.onView}
        onToggle={handlers.onToggle}
        onMenu={handlers.onMenu}
        onReorder={handlers.onReorder}
      >
        {expanded ? (
          <LayoutAnimationConfig skipEntering skipExiting>
            <View className="gap-3 pt-1" collapsable={false}>
              {stall ? (
                <StalledNote
                  exerciseId={exercise.exerciseId}
                  latestSessionId={stall.latestSessionId}
                  count={stall.count}
                  missed={stall.missed}
                  applied={stall.applied}
                  onApply={
                    readOnly ? undefined : (applied) => handlers.onStallDeload(exerciseId, applied)
                  }
                />
              ) : null}
              {adjustment && adjustedLabel && !data.done ? (
                <AdjustmentNote
                  adjustment={adjustment}
                  setLabel={adjustedLabel}
                  onUndo={readOnly ? undefined : () => handlers.onUndoAdjustment(exerciseId)}
                />
              ) : null}
              {data.setupNote ? <SetupNoteChip note={data.setupNote} /> : null}
              {!readOnly && data.activeSessionId && data.gymId ? (
                <MaxPrompt
                  exerciseId={exercise.exerciseId}
                  sessionId={data.activeSessionId}
                  gymId={data.gymId}
                  equipment={equipment}
                  unit={unit}
                />
              ) : null}
              {!readOnly &&
              data.activeSessionId &&
              data.gymId &&
              usesGymHistory(equipment) &&
              exercise.sets.some((set) => isStepEvidence(set.kind) && set.completedAt !== null) ? (
                <StepPrompt
                  key={`${data.gymId}:${exercise.exerciseId}:${unit}`}
                  exerciseId={exercise.exerciseId}
                  sessionId={data.activeSessionId}
                  gymId={data.gymId}
                  equipment={equipment}
                  unit={unit}
                />
              ) : null}
              {!readOnly && data.activeSessionId ? (
                <OverridePrompt
                  exerciseId={exercise.exerciseId}
                  sessionId={data.activeSessionId}
                  gymId={data.gymId}
                  equipment={equipment}
                  unit={unit}
                  workoutExerciseId={exercise.sourceWorkoutExerciseId}
                />
              ) : null}
              <ExerciseBody
                id={exercise.id}
                note={exercise.note}
                noteOpen={noteOpen}
                setNoteOpen={setNoteOpen}
                readOnly={readOnly}
                onNote={handlers.onNote}
              />
              {finishedLedger ? (
                <SuggestionLedgerLine
                  ledger={finishedLedger}
                  type={exercise.type}
                  unit={unit}
                  unitLabel={data.unitLabel}
                />
              ) : null}
              <GridOrHinted
                hinted={data.first && data.activeSessionId !== null && !readOnly}
                exerciseId={exerciseId}
                handlers={handlers}
                onAddSet={handlers.onAddSet}
                animate={animate}
                viewport={viewport}
                isBodyRegionVisible={isBodyRegionVisible}
              />
            </View>
          </LayoutAnimationConfig>
        ) : null}
      </ExerciseRow>
      {suggestion && suggestionNote ? (
        <ProgressionSheet
          note={suggestionNote}
          suggestion={suggestion}
          unit={unit}
          type={exercise.type}
          isOpen={reasonOpen}
          onOpenChange={setReasonOpen}
        />
      ) : null}
    </View>
  );
});

/**
 * An open exercise's note. It is edited in place and saved when the field is left; it is always
 * shown while it has text, and the Note button in the header reveals the field (focused) while it
 * has none.
 */
const ExerciseBody = memo(function ExerciseBody({
  id,
  note,
  noteOpen,
  setNoteOpen,
  readOnly,
  onNote,
}: {
  id: string;
  note: string | null;
  noteOpen: boolean;
  setNoteOpen: (open: boolean) => void;
  readOnly: boolean;
  onNote: (exerciseId: string, note: string | null) => void;
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
  const showsNote = note !== null || noteOpen;
  if (!showsNote) return null;
  return readOnly ? (
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
        // An empty note goes back to its button.
        if ((typed === undefined ? note : typed) === null) setNoteOpen(false);
      }}
    />
  );
});

/** The first exercise of an active Session carries the set-row hint; every other grid is plain. */
function GridOrHinted({
  hinted,
  ...props
}: { hinted: boolean } & React.ComponentProps<typeof SetGrid>) {
  return hinted ? <HintedSetGrid {...props} /> : <SetGrid {...props} />;
}
