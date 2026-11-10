import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Skeleton } from "@/platform/ui/skeleton";

import { displayTitle } from "../derived-title";
import { usePrograms } from "../use-programs";
import { useWorkouts } from "../use-workouts";

/** Saved plans until Sessions provide an active program and completed-workout history. */
export function TrainingHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const workouts = useWorkouts();
  const programs = usePrograms();
  const failed = workouts.status === "error" || programs.status === "error";
  const loading =
    workouts.status === "loading" ||
    programs.status === "loading" ||
    workouts.status === "first-sync" ||
    programs.status === "first-sync";
  return (
    <View className="gap-5">
      <View className="gap-3 rounded-2xl bg-surface p-5">
        <Text className="text-title-lg font-semibold text-foreground">
          {t("dashboard__plans_title")}
        </Text>
        <Text className="text-body text-muted">{t("dashboard__plans_body")}</Text>
        <Button variant="primary" onPress={() => router.push("/train")}>
          <Button.Label>{t("dashboard__open_training")}</Button.Label>
        </Button>
      </View>
      {failed ? (
        <Button
          variant="secondary"
          onPress={() => {
            workouts.retry();
            programs.retry();
          }}
        >
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : loading ? (
        <Skeleton className="h-24 w-full" label={t("common__loading")} />
      ) : (
        <>
          {programs.programs.length > 0 ? (
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-label text-muted">
                {t("dashboard__saved_programs")}
              </Text>
              {programs.programs.slice(0, 3).map((program) => (
                <Button
                  key={program.id}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: "/train/program/[id]", params: { id: program.id } })
                  }
                >
                  <Button.Label>{program.title}</Button.Label>
                </Button>
              ))}
            </View>
          ) : null}
          {workouts.workouts.length > 0 ? (
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-label text-muted">
                {t("dashboard__saved_workouts")}
              </Text>
              {workouts.workouts.slice(0, 3).map((workout) => (
                <Button
                  key={workout.id}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: "/train/workout/[id]", params: { id: workout.id } })
                  }
                >
                  <Button.Label>
                    {displayTitle(
                      workout.title,
                      workout.exercises.flatMap((entry) =>
                        entry.primaryMuscle ? [entry.primaryMuscle] : [],
                      ),
                      t,
                    )}
                  </Button.Label>
                </Button>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
