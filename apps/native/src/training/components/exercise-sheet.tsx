import {
  EQUIPMENT_KEYS,
  MUSCLE_GROUP_KEYS,
  SET_KINDS,
  SET_KIND_KEYS,
  TRAINING_LIMITS,
  supersetPlaces,
  type SupersetPlace,
  type ExerciseType,
  type PlannedSet,
  type SetKind,
} from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { CaretRight, Plus, Timer, X } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail } from "@/exercise";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { OptionSheet, type SheetOption } from "@/platform/ui/option-sheet";
import { Skeleton } from "@/platform/ui/skeleton";

import { formatClock, restChoices } from "../rest";
import {
  MAX_WARMUPS,
  appendSet,
  appendWarmup,
  chipTexts,
  editTarget,
  removeSetAt,
  replaceSet,
  supportsWarmups,
  withKind,
} from "../set-editing";
import { useCoalescedWriter } from "../use-coalesced-writer";
import { useTrainingPreferences } from "../use-training-preferences";
import { useWorkout } from "../use-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { EffortSheet } from "./effort-sheet";
import { InlineNote } from "./inline-note";
import { SetTable } from "./set-table";
import { SheetFrame } from "./sheet-frame";

const HEADER_THUMBNAIL = 44;
const REST_OFF = "off";
const REMOVE_SET = "remove";
type SetKindChoice = SetKind | typeof REMOVE_SET;

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
  const preferences = useTrainingPreferences();
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
  const [kindFor, setKindFor] = useState<number | null>(null);
  const [effortFor, setEffortFor] = useState<number | null>(null);
  const [restOpen, setRestOpen] = useState(false);

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
  // Set edits read the latest sets, so two quick edits in a row never overwrite each other.
  const editSets = (change: (sets: readonly PlannedSet[]) => PlannedSet[]) =>
    edit({ sets: change(draftRef.current.sets) });

  const letters = {
    warmup: t("training__chip_warmup"),
    working: "",
    drop: t("training__chip_drop"),
    failure: t("training__chip_failure"),
  } satisfies Record<SetKind, string>;
  const chips = chipTexts(draft.sets, letters);
  const full = draft.sets.length >= TRAINING_LIMITS.setsPerExercise;
  const warmups = draft.sets.filter((set) => set.kind === "warmup").length;
  const restValue =
    draft.restSeconds === null ? t("training__rest_off") : formatClock(draft.restSeconds);
  const kindOptions: SheetOption<SetKindChoice>[] = [
    ...SET_KINDS.filter((kind) => kind !== "warmup" || supportsWarmups(type)).map(
      (kind): SheetOption<SetKindChoice> => ({ value: kind, label: t(SET_KIND_KEYS[kind]) }),
    ),
    ...(draft.sets.length > 1
      ? [
          {
            value: REMOVE_SET,
            label: t("training__remove_set"),
          } satisfies SheetOption<SetKindChoice>,
        ]
      : []),
  ];
  const effortSet = effortFor === null ? undefined : draft.sets[effortFor];

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
        {info ? (
          <ExerciseThumbnail
            thumbnailKey={info.thumbnailKey}
            muscle={info.primaryMuscle}
            size={HEADER_THUMBNAIL}
          />
        ) : (
          <View
            className="rounded-lg bg-default"
            style={{ width: HEADER_THUMBNAIL, height: HEADER_THUMBNAIL }}
          />
        )}
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
        // A superset rests once, after its last exercise.
        <Text className="text-body text-muted">{t("training__rest_group_member")}</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("training__rest_chip_label", { value: restValue })}
          onPress={() => {
            haptic.tick();
            setRestOpen(true);
          }}
          className="h-10 flex-row items-center gap-2 self-start rounded-full bg-default px-4 active:bg-border"
        >
          <Timer size={16} color={subtle} />
          <Text className="text-label font-medium text-foreground">
            {t(place === "last" ? "training__rest_chip_group" : "training__rest_chip", {
              value: restValue,
            })}
          </Text>
        </Pressable>
      )}

      <View className="gap-4">
        <SetTable
          type={type}
          sets={draft.sets}
          chips={chips}
          weightUnit={preferences.weightUnit}
          effortScale={preferences.effortScale}
          onChange={(index, change) => editSets((sets) => editTarget(sets, index, change))}
          onKind={setKindFor}
          onEffort={setEffortFor}
        />
        <View className="flex-row gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            isDisabled={full}
            onPress={() => editSets((sets) => appendSet(sets, type))}
          >
            <Plus size={16} color={subtle} weight="bold" />
            <Button.Label>{t("training__add_set")}</Button.Label>
          </Button>
          {supportsWarmups(type) ? (
            <Button
              variant="secondary"
              className="flex-1"
              isDisabled={full || warmups >= MAX_WARMUPS}
              onPress={() => editSets((sets) => appendWarmup(sets, type))}
            >
              <Plus size={16} color={subtle} weight="bold" />
              <Button.Label>{t("training__add_warmup")}</Button.Label>
            </Button>
          ) : null}
        </View>
      </View>

      <OptionSheet<SetKindChoice>
        isOpen={kindFor !== null}
        onOpenChange={(open) => {
          if (!open) setKindFor(null);
        }}
        title={t("training__set_kind_title")}
        options={kindOptions}
        value={kindFor === null ? "working" : (draft.sets[kindFor]?.kind ?? "working")}
        onSelect={(choice) => {
          const index = kindFor;
          if (index === null) return;
          if (choice === REMOVE_SET) {
            editSets((sets) => removeSetAt(sets, index));
            return;
          }
          editSets((sets) => {
            const set = sets[index];
            return set ? replaceSet(sets, index, withKind(set, choice)) : [...sets];
          });
        }}
      />

      <OptionSheet<string>
        isOpen={restOpen}
        onOpenChange={setRestOpen}
        title={t(place === "last" ? "training__rest_group_title" : "training__rest_title")}
        options={[
          { value: REST_OFF, label: t("training__rest_off") },
          ...restChoices(draft.restSeconds).map((seconds) => ({
            value: String(seconds),
            label: formatClock(seconds),
          })),
        ]}
        value={draft.restSeconds === null ? REST_OFF : String(draft.restSeconds)}
        onSelect={(choice) => edit({ restSeconds: choice === REST_OFF ? null : Number(choice) })}
      />

      <EffortSheet
        isOpen={effortFor !== null}
        onOpenChange={(open) => {
          if (!open) setEffortFor(null);
        }}
        title={t("training__field_effort", {
          scale: t(
            preferences.effortScale === "rpe" ? "training__effort_rpe" : "training__effort_rir",
          ),
        })}
        value={
          effortSet?.effort_min !== undefined && effortSet.effort_max !== undefined
            ? { min: effortSet.effort_min, max: effortSet.effort_max }
            : null
        }
        scale={preferences.effortScale}
        onChange={(range) => {
          const index = effortFor;
          if (index === null) return;
          editSets((sets) =>
            editTarget(sets, index, { effort_min: range?.min, effort_max: range?.max }),
          );
        }}
      />
    </SheetFrame>
  );
}
