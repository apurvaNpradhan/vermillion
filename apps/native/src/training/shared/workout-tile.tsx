import type { MuscleGroup } from "@workspace/shared";
import { View } from "react-native";

import { BodyMapPair } from "@/body-map";
import { MediaImage } from "@/media";
import { workoutMuscles } from "@/training/workouts/workout-muscles";

import { PlanInitialTile } from "./plan-initial-tile";

/** The body maps fill this share of the tile: two figures side by side, as tall as the tile. */
const MAP_SHARE = 0.78;

/**
 * The tile of a Workout: its cover photo (a media, ADR 0040), else a small map of the muscles it
 * trains, else the title initial when it has no exercises yet. The map also shows while the
 * photo is still arriving on this device.
 */
export function WorkoutTile({
  title,
  size,
  coverMediaId = null,
  exercises,
}: {
  title: string;
  size: number;
  coverMediaId?: string | null;
  exercises: readonly {
    primaryMuscle: MuscleGroup | null;
    secondaryMuscles?: readonly MuscleGroup[];
  }[];
}) {
  const muscles = workoutMuscles(exercises);
  const map =
    muscles.primary.length === 0 && muscles.secondary.length === 0 ? (
      <PlanInitialTile title={title} size={size} />
    ) : (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="items-center justify-center overflow-hidden rounded-xl bg-default"
        style={{ width: size, height: size }}
      >
        <BodyMapPair
          primary={muscles.primary}
          secondary={muscles.secondary}
          gap={2}
          style={{ width: size * MAP_SHARE }}
        />
      </View>
    );
  if (coverMediaId === null) return map;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MediaImage mediaId={coverMediaId} size={size} fallback={map} />
    </View>
  );
}
