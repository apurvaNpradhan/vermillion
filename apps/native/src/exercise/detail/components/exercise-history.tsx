import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { Text, View } from "react-native";
import { usePreferences } from "@/preferences";
import { useTranslation } from "@/platform/i18n";
import { Page } from "@/platform/ui/page";
import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { useExercise } from "../use-exercise";
import { useExerciseHistory } from "../use-exercise-history";
import { RecentSessions } from "./recent-sessions";

export function ExerciseHistoryScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const exercise = useExercise(id);
  const history = useExerciseHistory(id);
  const { preferences } = usePreferences();
  return (
    <Page title={t("exercise__history_title")} back>
      {({ header, contentContainerStyle, ...scroll }) => (
        <AnimatedLegendList
          recycleItems={false}
          {...scroll}
          className="flex-1"
          contentContainerStyle={contentContainerStyle}
          data={history.sessions}
          keyExtractor={(session) => session.id}
          estimatedItemSize={220}
          extraData={preferences}
          renderItem={({ item }) => (
            <View className="px-4 pb-4">
              <RecentSessions
                sessions={[item]}
                unit={preferences.ui.weightUnit}
                timezone={preferences.timezone}
                showHeading={false}
              />
            </View>
          )}
          ListHeaderComponent={<View className="px-4 pb-4">{header}</View>}
          ListEmptyComponent={
            <Text className="px-4 text-body text-muted">
              {t(
                history.status === "loading"
                  ? "exercise__history_loading"
                  : history.status === "error"
                    ? "exercise__load_failed"
                    : "exercise__numbers_empty",
              )}
            </Text>
          }
          ListFooterComponent={
            exercise.status === "ready" ? (
              <View className="px-4 py-6">
                <MuscleDistribution
                  sets={history.sessions.flatMap((session) => session.sets)}
                  exercises={[
                    {
                      id,
                      primary_muscle: exercise.exercise.primaryMuscle,
                      secondary_muscles: exercise.exercise.secondaryMuscles,
                    },
                  ]}
                />
              </View>
            ) : null
          }
        />
      )}
    </Page>
  );
}
