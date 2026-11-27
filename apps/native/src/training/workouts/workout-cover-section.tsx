import type { WorkoutDetail } from "@workspace/sync";
import { useThemeColor } from "heroui-native";
import { ImageSquare, Trash } from "phosphor-react-native";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { WorkoutTile } from "@/training/shared/workout-tile";

import { useWorkoutCover } from "./use-workout-cover";

/** The cover tile in the editor's header area. */
const COVER_SIZE = 72;

/**
 * The Workout's cover at the top of the editor: the photo (or the muscle map standing in for it)
 * with Add / Replace and Remove beside it. Changes are saved at once.
 */
export function WorkoutCoverSection({
  workout,
  title,
}: {
  workout: Pick<WorkoutDetail, "id" | "coverMediaId" | "exercises">;
  title: string;
}) {
  const { t } = useTranslation();
  const cover = useWorkoutCover(workout.id);
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
  return (
    <View className="flex-row items-center gap-4">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("training__cover_label", { title })}
      >
        <WorkoutTile
          title={title}
          size={COVER_SIZE}
          coverMediaId={workout.coverMediaId}
          exercises={workout.exercises.flatMap((entry) => (entry.exercise ? [entry.exercise] : []))}
        />
      </View>
      <View className="flex-1 gap-2">
        <Button variant="secondary" isDisabled={cover.busy} onPress={() => void cover.pick()}>
          <ImageSquare size={20} color={foreground} />
          <Button.Label>
            {t(workout.coverMediaId === null ? "training__cover_add" : "training__cover_replace")}
          </Button.Label>
        </Button>
        {workout.coverMediaId !== null ? (
          <Button variant="danger-soft" isDisabled={cover.busy} onPress={() => void cover.remove()}>
            <Trash size={20} color={danger} />
            <Button.Label>{t("training__cover_remove")}</Button.Label>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
