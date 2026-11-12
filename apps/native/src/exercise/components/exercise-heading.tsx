import type { MuscleGroup } from "@workspace/shared";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail } from "../library/components/exercise-thumbnail";

const SIZE = 40;

/**
 * An exercise's name above its sets: a round 40pt thumbnail and the name in the accent colour as
 * a link to the exercise. Without a press handler the name is plain text.
 */
export function ExerciseHeading({
  title,
  thumbnailKey,
  muscle,
  onPress,
}: {
  title: string;
  thumbnailKey: string | null;
  muscle: MuscleGroup;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "link" : "text"}
      accessibilityLabel={title}
      disabled={!onPress}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 active:opacity-60"
    >
      <View
        className="overflow-hidden rounded-full"
        style={{ width: SIZE, height: SIZE }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ExerciseThumbnail thumbnailKey={thumbnailKey} muscle={muscle} size={SIZE} />
      </View>
      <Text numberOfLines={2} className="flex-1 font-semibold text-body text-identity">
        {title}
      </Text>
    </Pressable>
  );
}
