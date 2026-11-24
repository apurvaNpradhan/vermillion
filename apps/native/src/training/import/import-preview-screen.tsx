import type { ShareExercise, ShareWorkout } from "@workspace/shared";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { ANCHORED } from "@/platform/navigation/anchored";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ScrollPage } from "@/platform/ui/page";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useSharePreview } from "@/share";
import { useSummaryLabels } from "@/training/workouts/use-summary-labels";
import { summariseSets } from "@/training/workouts/summarise-sets";
import { useTrainingPreferences } from "@/training/shared/use-training-preferences";

import { summariseImport } from "./import-preview";
import { useImportPlan } from "./use-import-plan";

type Snapshot = Extract<ReturnType<typeof useSharePreview>, { status: "found" }>["snapshot"];

function Notice({ title, body, retry }: { title: string; body: string; retry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-3 py-10">
      <Text className="font-semibold text-center text-title-md text-foreground">{title}</Text>
      <Text className="font-normal text-center text-body text-muted">{body}</Text>
      {retry ? (
        <Button variant="secondary" onPress={retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}

function WorkoutBlock({
  workout,
  heading,
  isNew,
}: {
  workout: ShareWorkout;
  heading: string;
  isNew: (exercise: ShareExercise) => boolean;
}) {
  const { t } = useTranslation();
  const prefs = useTrainingPreferences();
  const labels = useSummaryLabels();
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
        {heading}
      </Text>
      <View className="gap-1">
        {workout.exercises.map((entry, index) => (
          <View key={`${entry.exercise.name}-${index}`} className="min-h-11 justify-center">
            <Text className="font-medium text-body text-foreground">
              {entry.exercise.name}
              {isNew(entry.exercise) ? `  ·  ${t("share__import_new_exercise")}` : ""}
            </Text>
            <Text className="font-normal text-caption text-muted">
              {summariseSets(
                entry.sets,
                entry.exercise.exercise_type,
                entry.rest_seconds,
                prefs,
                labels,
              )}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Found({
  snapshot,
  recheck,
  onClose,
}: {
  snapshot: Snapshot;
  recheck: () => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useAppToast();
  const plan = useImportPlan(snapshot);
  const matches = plan.exercises ?? [];
  const summary = summariseImport(snapshot, matches);
  const keyOf = (exercise: ShareExercise) =>
    `${exercise.catalog_id ?? ""}|${exercise.name}|${exercise.equipment}|${exercise.exercise_type}`;
  const created = new Set(
    matches.flatMap((item) => (item.match.kind === "new" ? [keyOf(item.exercise)] : [])),
  );
  const isNew = (exercise: ShareExercise) => created.has(keyOf(exercise));
  const program = snapshot.format === "sigil.program/v1" ? snapshot.program : null;
  const title =
    (program
      ? program.title
      : snapshot.format === "sigil.workout/v1"
        ? snapshot.workout.title
        : null) ?? t("training__workout");

  const add = async () => {
    // A link turned off since the preview opened must not be added; the screen then says so.
    if (!(await recheck())) return;
    const added = await plan.add();
    if (!added) return;
    haptic.success();
    toast.show({
      label: t(
        added.kind === "program" ? "share__import_added_program" : "share__import_added_workout",
      ),
    });
    if (added.kind === "program") {
      router.replace({ pathname: "/train/program/[id]", params: { id: added.id } }, ANCHORED);
    } else {
      router.replace({ pathname: "/train/workout/[id]", params: { id: added.id } }, ANCHORED);
    }
  };

  const facts = [
    summary.kind === "program" ? t("share__import_workouts", { count: summary.workouts }) : null,
    t("share__import_exercises", { count: summary.exercises }),
    summary.newExercises > 0
      ? t("share__import_new_exercises", { count: summary.newExercises })
      : null,
  ].flatMap((fact) => (fact ? [fact] : []));

  return (
    <ScrollPage
      title={title}
      overline={t(summary.kind === "program" ? "share__import_program" : "share__import_workout")}
      back
      backFallback="/"
    >
      <Text className="font-normal text-body text-muted">{facts.join(" · ")}</Text>
      {program?.description ? (
        <Text className="font-normal text-body text-foreground">{program.description}</Text>
      ) : null}
      <Button
        variant="primary"
        isDisabled={plan.busy || plan.exercises === null}
        onPress={() => void add()}
      >
        <Button.Label>
          {t(
            summary.kind === "program" ? "share__import_add_program" : "share__import_add_workout",
          )}
        </Button.Label>
      </Button>
      <Button variant="ghost" onPress={onClose}>
        <Button.Label>{t("common__cancel")}</Button.Label>
      </Button>
      <View className="gap-6">
        {program
          ? program.rotation.map((index, day) => {
              const workout = index === null ? null : program.workouts[index];
              const heading = t("share__import_day", {
                day: day + 1,
                title: workout
                  ? (workout.title ?? t("training__workout"))
                  : t("share__import_rest"),
              });
              return workout ? (
                <WorkoutBlock
                  key={`${day}-${index}`}
                  workout={workout}
                  heading={heading}
                  isNew={isNew}
                />
              ) : (
                <Text key={`${day}-rest`} className="font-semibold text-title-md text-muted">
                  {heading}
                </Text>
              );
            })
          : snapshot.format === "sigil.workout/v1"
            ? [
                <WorkoutBlock
                  key="workout"
                  workout={snapshot.workout}
                  heading={t("share__import_exercises_heading")}
                  isNew={isNew}
                />,
              ]
            : null}
      </View>
    </ScrollPage>
  );
}

/**
 * The preview a Share link or code opens: what the plan holds and what adding it does here, then
 * "Add to my programs" or "Add to my workouts". Nothing is written until that button.
 */
export function ImportPreviewScreen({ code, onClose }: { code: string; onClose: () => void }) {
  const { t } = useTranslation();
  const preview = useSharePreview(code);
  if (preview.status === "found")
    return <Found snapshot={preview.snapshot} recheck={preview.recheck} onClose={onClose} />;
  const copy = {
    loading: ["share__import_loading", "share__import_loading_hint"],
    missing: ["share__import_missing", "share__import_missing_hint"],
    gone: ["share__import_gone", "share__import_gone_hint"],
    offline: ["share__import_offline", "share__import_offline_hint"],
    error: ["share__import_error", "share__import_error_hint"],
  } as const;
  const [title, body] = copy[preview.status];
  return (
    <ScrollPage title={t("share__import_title")} back backFallback="/">
      <Notice
        title={t(title)}
        body={t(body)}
        retry={
          preview.status === "offline" || preview.status === "error" ? preview.retry : undefined
        }
      />
    </ScrollPage>
  );
}
