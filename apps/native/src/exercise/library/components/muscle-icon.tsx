import type { MuscleGroup } from "@workspace/shared";
import { Heartbeat, PersonArmsSpread, DotsThree, type IconProps } from "phosphor-react-native";
import type { ComponentType } from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { BodyGroupIcon, DISC_CLASS, isBodyGroup, type BodyGroup } from "@/body-map";
import { isColorString } from "@/platform/theme";

/** The groups the body map cannot draw. */
const UNDRAWN_ICONS = {
  cardio: Heartbeat,
  full_body: PersonArmsSpread,
  other: DotsThree,
} as const satisfies Record<Exclude<MuscleGroup, BodyGroup>, ComponentType<IconProps>>;

/**
 * A circular icon for a muscle group: the body zoomed to the group with it highlighted, or a
 * symbol on the same light disc for the three groups with no drawing. It is the thumbnail
 * fallback and the muscle lists' icon.
 */
export function MuscleIcon({ muscle, size }: { muscle: MuscleGroup; size: number }) {
  // The disc is light in both themes, so its symbol is a fixed dark neutral.
  const ink = useCSSVariable("--color-neutral-600");
  if (isBodyGroup(muscle)) return <BodyGroupIcon group={muscle} size={size} />;
  const Icon = UNDRAWN_ICONS[muscle];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`items-center justify-center ${DISC_CLASS}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.55)} color={isColorString(ink) ? ink : undefined} />
    </View>
  );
}
