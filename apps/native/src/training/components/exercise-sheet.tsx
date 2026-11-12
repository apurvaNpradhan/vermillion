import {
  EQUIPMENT_KEYS,
  MUSCLE_GROUP_KEYS,
  TRAINING_LIMITS,
  supersetPlaces,
  type SupersetPlace,
  type ExerciseType,
  type PlannedSet,
} from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { CaretRight, X } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { useSubtleColor } from "@/platform/theme";
import { EmptyState } from "@/platform/ui/empty-state";
import { Skeleton } from "@/platform/ui/skeleton";

import { useCoalescedWriter } from "../use-coalesced-writer";
import { useWorkout } from "../use-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { RestPicker } from "./rest-picker";
import { DetailedTargets } from "./detailed-targets";
import { InlineNote } from "./inline-note";
import { SheetFrame } from "./sheet-frame";

const HEADER_THUMBNAIL = 40;

const FALLBACK_TYPE: ExerciseType = "weight_reps";

type Draft = { sets: PlannedSet[]; restSeconds: number | null; note: string | null };

const draftOf = (entry: WorkoutExerciseDetail): Draft => ({
  sets: entry.sets,
  restSeconds: entry.restSeconds,
  note: entry.note,
});

/**
 * The exercise sheet of one Workout exercise: header, pinned note, rest chip and the set table. Edits show
 * at once and are written together once they pause (400 ms), so there is no Save.
 */
export function ExerciseSheetScreen({
  workoutId,
  entryId,
  onClose,
  onOpenExercise,
}: {
  workoutId: string;
  entryId: string;
  onClose: () => void;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const { t } = useTranslation();
  const state = useWorkout(workoutId);
  useHideTabBar(true);
  const entry =
    state.status === "ready"
      ? state.workout.exercises.find((candidate) => candidate.id === entryId)
      : undefined;
  const gone = state.status === "missing" || (state.status === "ready" && entry === undefined);
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  if (entry && state.status === "ready") {
    const index = state.workout.exercises.findIndex((candidate) => candidate.id === entry.id);
    const place = supersetPlaces(state.workout.exercises, (row) => row.supersetGroup)[index];
    return (
      <LoadedSheet
        entry={entry}
        place={place ?? "none"}
        onClose={onClose}
        onOpenExercise={onOpenExercise}
      />
    );
  }
  return (
    <SheetFrame title={t("training__exercise_sheet_title")} onClose={onClose}>
      {state.status === "error" ? (
        <EmptyState icon={X} title={t("training__load_failed")} />
      ) : (
        <>
          <Skeleton label={t("common__loading")} className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
        </>
      )}
    </SheetFrame>
  );
}

function LoadedSheet({
  entry,
  place,
  onClose,
  onOpenExercise,
}: {
  entry: WorkoutExerciseDetail;
  /** Where the exercise sits in a superset. */
  place: SupersetPlace;
  onClose: () => void;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const { t } = useTranslation();
  const { updateExercise } = useWorkoutActions();
  const subtle = useSubtleColor();
  const info = entry.exercise;
  const type = info?.exerciseType ?? FALLBACK_TYPE;
  const name = info?.title ?? t("training__exercise_missing");

  const writer = useCoalescedWriter(
    (patch: { rest_seconds?: number | null; note?: string | null; sets?: PlannedSet[] }) =>
      updateExercise(entry.id, patch),
  );
  const [draft, setDraft] = useState<Draft>(() => draftOf(entry));
  const draftRef = useRef(draft);

  // Take in changes from the database (another device) unless an edit of ours is on its way.
  const sourceKey = JSON.stringify(draftOf(entry));
  useEffect(() => {
    if (!writer.busy()) {
      const next = draftOf(entry);
      draftRef.current = next;
      setDraft(next);
    }
    // `entry` is read through `sourceKey`, which changes exactly when its content does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const edit = (change: Partial<Draft>) => {
    const next = { ...draftRef.current, ...change };
    draftRef.current = next;
    setDraft(next);
    writer.queue({
      ...(change.sets === undefined ? {} : { sets: change.sets }),
      ...(change.restSeconds === undefined ? {} : { rest_seconds: change.restSeconds }),
      ...(change.note === undefined ? {} : { note: change.note }),
    });
  };

  return (
    <SheetFrame
      title={t("training__exercise_sheet_title")}
      onClose={() => {
        writer.flush();
        onClose();
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t("training__open_exercise", { title: name })}
        onPress={() => {
          writer.flush();
          onOpenExercise(entry.exerciseId);
        }}
        className="min-h-11 flex-row items-center gap-3"
      >
        <ExerciseThumbnail
          title={name}
          thumbnailKey={info?.thumbnailKey ?? null}
          size={HEADER_THUMBNAIL}
        />
        <View className="flex-1 gap-0.5">
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            className="font-semibold text-title-md text-foreground"
          >
            {name}
          </Text>
          {info ? (
            <Text numberOfLines={1} className="text-caption text-muted">
              {t("exercise__row_subtitle", {
                muscle: t(MUSCLE_GROUP_KEYS[info.primaryMuscle]),
                equipment: t(EQUIPMENT_KEYS[info.equipment]),
              })}
            </Text>
          ) : null}
        </View>
        <CaretRight size={18} color={subtle} />
      </Pressable>

      <InlineNote
        label={t("training__pinned_note")}
        value={draft.note}
        onText={(note) => edit({ note })}
        placeholder={t("training__pinned_note_placeholder")}
        maxLength={TRAINING_LIMITS.noteMax}
      />

      {place === "first" || place === "middle" ? (
        <Text className="text-body text-muted">{t("training__rest_group_member")}</Text>
      ) : (
        <RestPicker
          value={draft.restSeconds}
          group={place === "last"}
          onChange={(restSeconds) => edit({ restSeconds })}
        />
      )}

      <DetailedTargets sets={draft.sets} type={type} onSets={(sets) => edit({ sets })} />
    </SheetFrame>
  );
}
