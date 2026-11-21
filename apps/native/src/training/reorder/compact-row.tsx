import type { SupersetPlace } from "@workspace/shared";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { SupersetBracket } from "@/training/workouts/workout-exercise-row";

/**
 * The content of one Reorder row: a superset bar when the item is in one, a thumbnail or number,
 * and the title on one line. The view adds the drag handle.
 */
export function CompactRow({
  place = "none",
  leading,
  title,
  muted = false,
}: {
  place?: SupersetPlace;
  leading: ReactNode;
  title: string;
  muted?: boolean;
}) {
  return (
    <View
      className={`h-full flex-row items-center gap-3 pr-1 ${place === "none" ? "pl-3" : "pl-6"}`}
    >
      <SupersetBracket place={place} />
      {leading}
      <Text
        numberOfLines={1}
        className={`flex-1 text-body ${muted ? "text-muted" : "font-medium text-foreground"}`}
      >
        {title}
      </Text>
    </View>
  );
}
