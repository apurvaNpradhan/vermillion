import {
  SET_KINDS,
  SET_KIND_KEYS,
  TRAINING_LIMITS,
  type ExerciseType,
  type PlannedSet,
  type SetKind,
} from "@workspace/shared";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { Switch, useThemeColor } from "heroui-native";
import { CaretRight, Plus, Trash, X } from "phosphor-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { Skeleton } from "@/platform/ui/skeleton";
import { SwipeGroup, SwipeRow } from "@/platform/ui/swipe-row";

import { REST_MAX_SECONDS, REST_MIN_SECONDS, formatClock, restWhenOn, stepRest } from "../rest";
import {
  MAX_WARMUPS,
  MIN_WORKING,
  alikeModel,
  appendSet,
  buildAlike,
  chipTexts,
  mergeTarget,
  clampCounts,
  removeSetAt,
  replaceSet,
  setsAlike,
  supportsWarmups,
  targetOf,
  withKind,
  withTarget,
} from "../set-editing";
import { useCoalescedWriter } from "../use-coalesced-writer";
import { useTrainingPreferences } from "../use-training-preferences";
import { useWorkout } from "../use-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { SavedTextField } from "./saved-text-field";
import { Stepper } from "./stepper";
import { TargetFields } from "./target-fields";

const FALLBACK_TYPE: ExerciseType = "weight_reps";

type Draft = { sets: PlannedSet[]; restSeconds: number | null; note: string | null };

const draftOf = (entry: WorkoutExerciseDetail): Draft => ({
  sets: entry.sets,
  restSeconds: entry.restSeconds,
  note: entry.note,
});

/**
 * The exercise sheet of one Workout exercise: the pinned note, rest, and the targets. Edits show
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

  if (entry) {
    return <LoadedSheet entry={entry} onClose={onClose} onOpenExercise={onOpenExercise} />;
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
  onClose,
  onOpenExercise,
}: {
  entry: WorkoutExerciseDetail;
  onClose: () => void;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const { t } = useTranslation();
  const { updateExercise } = useWorkoutActions();
  const preferences = useTrainingPreferences();
  const subtle = useSubtleColor();
  const type = entry.exercise?.exerciseType ?? FALLBACK_TYPE;
  const name = entry.exercise?.title ?? t("training__exercise_missing");

  const writer = useCoalescedWriter(
    (patch: { rest_seconds?: number | null; note?: string | null; sets?: PlannedSet[] }) =>
      updateExercise(entry.id, patch),
  );
  const [draft, setDraft] = useState<Draft>(() => draftOf(entry));
  const [alikeOn, setAlikeOn] = useState(() => setsAlike(entry.sets));
  const [kindFor, setKindFor] = useState<number | null>(null);

  // Take in changes from the database (another device) unless an edit of ours is on its way.
  const sourceKey = JSON.stringify(draftOf(entry));
  useEffect(() => {
    if (!writer.busy()) setDraft(draftOf(entry));
    // `entry` is read through `sourceKey`, which changes exactly when its content does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const edit = (change: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...change }));
    writer.queue({
      ...(change.sets === undefined ? {} : { sets: change.sets }),
      ...(change.restSeconds === undefined ? {} : { rest_seconds: change.restSeconds }),
      ...(change.note === undefined ? {} : { note: change.note }),
    });
  };

  const alike = alikeOn && setsAlike(draft.sets);
  const model = alikeModel(draft.sets, type);
  const counts = clampCounts(type, model.warmups, model.working);
  const setAlike = (change: Partial<typeof model>) =>
    edit({ sets: buildAlike({ ...model, ...change }, type, draft.sets) });

  const restOn = draft.restSeconds !== null;
  const lastRest = useLastRest(draft.restSeconds);

  const letters = {
    warmup: t("training__chip_warmup"),
    working: "",
    drop: t("training__chip_drop"),
    failure: t("training__chip_failure"),
  } satisfies Record<SetKind, string>;
  const chips = chipTexts(draft.sets, letters);

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
        className="min-h-11 flex-row items-center justify-between gap-3"
      >
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          className="flex-1 font-semibold text-title-lg text-foreground"
        >
          {name}
        </Text>
        <CaretRight size={18} color={subtle} />
      </Pressable>

      <SavedTextField
        label={t("training__pinned_note")}
        description={t("training__pinned_note_hint")}
        value={draft.note}
        onText={(note) => edit({ note })}
        placeholder={t("training__pinned_note_placeholder")}
        multiline
        maxLength={TRAINING_LIMITS.noteMax}
      />

      <Section title={t("training__rest_title")}>
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Stepper
              label={t("training__rest_title")}
              valueText={
                draft.restSeconds === null
                  ? t("training__rest_off")
                  : formatClock(draft.restSeconds)
              }
              disabled={!restOn}
              onStep={(direction) =>
                edit({
                  restSeconds: stepRest(
                    draft.restSeconds ?? lastRest ?? preferences.defaultRestSeconds,
                    direction,
                  ),
                })
              }
              canDecrement={restOn && (draft.restSeconds ?? 0) > REST_MIN_SECONDS}
              canIncrement={restOn && (draft.restSeconds ?? 0) < REST_MAX_SECONDS}
              decrementLabel={t("training__rest_less")}
              incrementLabel={t("training__rest_more")}
            />
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-body text-foreground">{t("training__rest_off")}</Text>
            <Switch
              isSelected={!restOn}
              onSelectedChange={(off) => {
                haptic.tick();
                edit({
                  restSeconds: off ? null : restWhenOn(lastRest, preferences.defaultRestSeconds),
                });
              }}
              accessibilityLabel={t("training__rest_off_toggle")}
            />
          </View>
        </View>
      </Section>

      <Section title={t("training__targets_title")}>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-body text-foreground">{t("training__alike")}</Text>
            {!alike && !setsAlike(draft.sets) ? (
              <Text className="text-caption text-muted">{t("training__alike_differ")}</Text>
            ) : null}
          </View>
          <Switch
            isSelected={alike}
            isDisabled={!alike && !setsAlike(draft.sets)}
            onSelectedChange={(on) => {
              haptic.tick();
              setAlikeOn(on);
            }}
            accessibilityLabel={t("training__alike")}
          />
        </View>

        {alike ? (
          <View className="gap-4">
            <TargetFields
              type={type}
              target={model.target}
              weightUnit={preferences.weightUnit}
              effortScale={preferences.effortScale}
              onChange={(change) => setAlike({ target: mergeTarget(model.target, change) })}
            />
            <View className="gap-1.5">
              <Text className="text-label font-medium text-foreground">
                {t("training__working_sets")}
              </Text>
              <Stepper
                label={t("training__working_sets")}
                valueText={String(counts.working)}
                onStep={(direction) => setAlike({ working: counts.working + direction })}
                canDecrement={counts.working > MIN_WORKING}
                canIncrement={counts.working + counts.warmups < TRAINING_LIMITS.setsPerExercise}
                decrementLabel={t("training__working_sets_less")}
                incrementLabel={t("training__working_sets_more")}
              />
            </View>
            {supportsWarmups(type) ? (
              <View className="gap-1.5">
                <Text className="text-label font-medium text-foreground">
                  {t("training__warmup_sets")}
                </Text>
                <Stepper
                  label={t("training__warmup_sets")}
                  valueText={String(counts.warmups)}
                  onStep={(direction) => setAlike({ warmups: counts.warmups + direction })}
                  canDecrement={counts.warmups > 0}
                  canIncrement={
                    counts.warmups < MAX_WARMUPS &&
                    counts.warmups + counts.working < TRAINING_LIMITS.setsPerExercise
                  }
                  decrementLabel={t("training__warmup_sets_less")}
                  incrementLabel={t("training__warmup_sets_more")}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <SwipeGroup>
            <View className="gap-3">
              {draft.sets.map((set, index) => (
                <SwipeRow
                  key={index}
                  actions={
                    draft.sets.length > 1
                      ? [
                          {
                            key: "remove",
                            label: t("training__remove_set"),
                            icon: Trash,
                            tone: "danger",
                            onPress: () => edit({ sets: removeSetAt(draft.sets, index) }),
                          },
                        ]
                      : []
                  }
                >
                  {(a11y) => (
                    <View
                      {...a11y}
                      className="gap-4 rounded-2xl border border-border bg-surface p-3"
                    >
                      <View className="flex-row items-center gap-3">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("training__set_kind_change", {
                            number: index + 1,
                            kind: t(SET_KIND_KEYS[set.kind]),
                          })}
                          onPress={() => setKindFor(index)}
                          className="h-9 min-w-9 items-center justify-center rounded-full bg-default px-2 active:bg-border"
                        >
                          <Text className="font-semibold text-label text-foreground">
                            {chips[index]}
                          </Text>
                        </Pressable>
                        <Text className="flex-1 text-body text-muted">
                          {t(SET_KIND_KEYS[set.kind])}
                        </Text>
                      </View>
                      <TargetFields
                        type={type}
                        target={targetOf(set)}
                        repsOnly={set.kind === "warmup"}
                        weightUnit={preferences.weightUnit}
                        effortScale={preferences.effortScale}
                        onChange={(change) =>
                          edit({ sets: replaceSet(draft.sets, index, withTarget(set, change)) })
                        }
                      />
                    </View>
                  )}
                </SwipeRow>
              ))}
              <Button
                variant="secondary"
                isDisabled={draft.sets.length >= TRAINING_LIMITS.setsPerExercise}
                onPress={() => edit({ sets: appendSet(draft.sets, type) })}
              >
                <Plus size={16} color={subtle} weight="bold" />
                <Button.Label>{t("training__add_set")}</Button.Label>
              </Button>
            </View>
          </SwipeGroup>
        )}
      </Section>

      <OptionSheet<SetKind>
        isOpen={kindFor !== null}
        onOpenChange={(open) => {
          if (!open) setKindFor(null);
        }}
        title={t("training__set_kind_title")}
        options={SET_KINDS.map((kind) => ({ value: kind, label: t(SET_KIND_KEYS[kind]) }))}
        value={kindFor === null ? "working" : (draft.sets[kindFor]?.kind ?? "working")}
        onSelect={(kind) => {
          const index = kindFor;
          const set = index === null ? undefined : draft.sets[index];
          if (index !== null && set) {
            edit({ sets: replaceSet(draft.sets, index, withKind(set, kind)) });
          }
        }}
      />
    </SheetFrame>
  );
}

/** The last rest the exercise had while on, so switching Off then On brings it back. */
function useLastRest(current: number | null): number | null {
  const [last, setLast] = useState<number | null>(current);
  useEffect(() => {
    if (current !== null) setLast(current);
  }, [current]);
  return last;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-4">
      <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** The sheet's close button and title over scrolling content that makes room for the keyboard. */
function SheetFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={24}
      >
        <View className="h-11 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common__close")}
            onPress={onClose}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-default"
          >
            <X size={18} color={foreground} weight="bold" />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 px-3 text-center font-semibold text-title-md text-foreground"
          >
            {title}
          </Text>
          <View className="h-11 w-11" />
        </View>
        {children}
      </KeyboardAwareScrollView>
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 bg-background"
        style={{ height: insets.top }}
      />
    </View>
  );
}
