import { Text, View } from "react-native";
import { ShareComposer, type ShareTemplate, type ShareToggle } from "@/share";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { useWorkout } from "@/training/workouts/use-workout";
import { useProgram } from "@/platform/training/use-program";
import { usePlanShareData } from "./use-plan-share-data";
import { useSummaryLabels } from "@/training/workouts/use-summary-labels";
import { useTrainingPreferences } from "@/training/shared/use-training-preferences";
import { ProgramCover, ProgramOverview, WorkoutCard } from "./cards";
import { workoutDays } from "./plan-data";
import { displayTitle } from "@/platform/training/derived-title";

function ShareStatus({ loading, onClose }: { loading: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  if (loading) return <View className="flex-1 bg-background" />;
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="font-normal text-center text-body text-muted">
        {t("training__load_failed")}
      </Text>
      <Button variant="secondary" onPress={onClose}>
        <Button.Label>{t("share__close")}</Button.Label>
      </Button>
    </View>
  );
}

export function WorkoutShareScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const state = useWorkout(id);
  const workout = state.status === "ready" ? state.workout : null;
  const owner = useProgram(workout?.programId ?? "");
  const prefs = useTrainingPreferences();
  const labels = useSummaryLabels();
  if (!workout) return <ShareStatus loading={state.status === "loading"} onClose={onClose} />;
  if (workout.programId && owner.status === "loading")
    return <ShareStatus loading onClose={onClose} />;
  const templates: ShareTemplate<"weights">[] = [
    {
      id: "workout",
      label: t("training__workout"),
      supportsTransparent: false,
      render: (context) => (
        <WorkoutCard
          workout={workout}
          label={owner.status === "ready" ? owner.program.title : undefined}
          context={context}
          prefs={prefs}
          labels={labels}
        />
      ),
    },
  ];
  const toggles: ShareToggle<"weights">[] = [
    { id: "weights", label: t("share__toggle_weights"), defaultOn: false, remember: true },
  ];
  return (
    <ShareComposer
      kind="workout"
      title={t("share__title_workout")}
      templates={templates}
      toggles={toggles}
    />
  );
}

export function ProgramShareScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const state = usePlanShareData(id);
  const prefs = useTrainingPreferences();
  const labels = useSummaryLabels();
  const plan = state.value;
  if (!plan) return <ShareStatus loading={state.loading} onClose={onClose} />;
  const cover = plan.coverMediaId;
  const templates: ShareTemplate<"weights">[] = [
    {
      id: "overview",
      label: t("share__plan_overview"),
      supportsTransparent: false,
      fixedBackground: cover ? "photo" : undefined,
      render: (context) => <ProgramOverview plan={plan} context={context} />,
    },
    ...workoutDays(plan.slots).map(({ workout, day, total }) => {
      const title = displayTitle(
        workout.title,
        workout.exercises.flatMap((entry) =>
          entry.exercise ? [entry.exercise.primaryMuscle] : [],
        ),
        (key) => t(key),
      );
      const label = t("share__plan_day", { day, total, title });
      return {
        id: `day-${day}`,
        label,
        supportsTransparent: false,
        render: (context: Parameters<ShareTemplate<"weights">["render"]>[0]) => (
          <WorkoutCard
            workout={workout}
            label={label}
            context={context}
            prefs={prefs}
            labels={labels}
          />
        ),
      };
    }),
  ];
  const toggles: ShareToggle<"weights">[] = [
    { id: "weights", label: t("share__toggle_weights"), defaultOn: false, remember: true },
  ];
  return (
    <ShareComposer
      kind="program"
      title={t("share__title_program")}
      templates={templates}
      toggles={toggles}
      photo={cover ? { render: () => <ProgramCover mediaId={cover} /> } : undefined}
    />
  );
}
