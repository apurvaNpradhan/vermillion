import { useRouter } from "expo-router";
import { Barbell, Plus, WarningCircle } from "phosphor-react-native";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useTabAction } from "@/platform/navigation/tab-action";
import { EmptyState } from "@/platform/ui/empty-state";
import { ScrollPage } from "@/platform/ui/page";
import { Skeleton } from "@/platform/ui/skeleton";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { SyncBanner } from "@/sync";

import { useStartWorkout } from "../use-start-workout";
import { useWorkoutActions } from "../use-workout-actions";
import { useWorkouts } from "../use-workouts";
import { WorkoutRow } from "./workout-row";

/**
 * The Train tab: standalone Workouts, newest first. The Programs section joins above them with
 * the Programs slice. Each state of the list (loading, first sync, empty, error) looks different.
 */
export function TrainScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, workouts, retry } = useWorkouts();
  const { fromPicker } = useStartWorkout();
  const actions = useWorkoutActions();

  const newWorkout = useCallback(() => void fromPicker(), [fromPicker]);
  useTabAction(
    useMemo(
      () => ({ icon: Plus, label: t("training__new_workout"), onPress: newWorkout }),
      [t, newWorkout],
    ),
  );

  const open = useCallback(
    (id: string) => router.push({ pathname: "/train/workout/[id]", params: { id } }),
    [router],
  );
  const duplicate = useCallback(
    async (workout: { id: string; title: string | null }) => {
      const copy = await actions.duplicate(workout.id, workout.title);
      if (copy) open(copy);
    },
    [actions, open],
  );
  const remove = useCallback(
    (id: string, title: string) => void actions.remove(id, title),
    [actions],
  );

  return (
    <ScrollPage title={t("training__title")}>
      <SyncBanner />
      {status === "loading" ? <ListSkeleton label={t("common__loading")} /> : null}
      {status === "first-sync" ? (
        <View className="gap-3">
          <ListSkeleton label={t("common__loading")} />
          <Text accessibilityLiveRegion="polite" className="text-center text-caption text-muted">
            {t("training__first_sync")}
          </Text>
        </View>
      ) : null}
      {status === "error" ? (
        <EmptyState
          icon={WarningCircle}
          title={t("training__load_failed")}
          action={{ label: t("training__retry"), onPress: retry }}
        />
      ) : null}
      {status === "empty" ? (
        <EmptyState
          icon={Barbell}
          title={t("training__empty_title")}
          action={{ label: t("training__new_workout"), onPress: newWorkout }}
        />
      ) : null}
      {status === "list" ? (
        <View className="-mx-4 gap-2">
          <Text
            accessibilityRole="header"
            className="px-5 font-semibold text-overline uppercase text-muted"
          >
            {t("training__workouts")}
          </Text>
          <SwipeGroup>
            <View className="border-t border-border">
              {workouts.map((workout) => (
                <WorkoutRow
                  key={workout.id}
                  workout={workout}
                  onOpen={open}
                  onDuplicate={duplicate}
                  onDelete={remove}
                />
              ))}
            </View>
          </SwipeGroup>
        </View>
      ) : null}
    </ScrollPage>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} className="min-h-[72px] flex-row items-center gap-3 py-3">
          <Skeleton style={{ width: 48, height: 48 }} />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}
