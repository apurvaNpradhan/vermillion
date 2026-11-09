import type { Equipment } from "@workspace/shared";
import {
  Barbell,
  Cylinder,
  Disc,
  DotsThree,
  Gear,
  Lasso,
  Link,
  PersonSimple,
  Tire,
  type IconProps,
} from "phosphor-react-native";
import type { ComponentType, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useSubtleColor } from "@/platform/theme";

import { chunked } from "../library/filter-state";

const COLUMNS = 3;
/** Side of a cell's icon tile. */
export const TILE = 36;

// Neutral stand-ins until the library has its own equipment art.
const EQUIPMENT_ICONS = {
  none: PersonSimple,
  barbell: Barbell,
  dumbbell: Cylinder,
  kettlebell: Tire,
  machine: Gear,
  plate: Disc,
  resistance_band: Lasso,
  suspension: Link,
  other: DotsThree,
} as const satisfies Record<Equipment, ComponentType<IconProps>>;

/** Rows of three equal cells; a short last row is padded so its cells keep the same width. */
export function ChoiceGrid<T extends string>({
  items,
  render,
}: {
  items: readonly T[];
  render: (item: T) => ReactNode;
}) {
  return (
    <View className="gap-2">
      {chunked(items, COLUMNS).map((row) => (
        <View key={row.join()} className="flex-row gap-2">
          {row.map(render)}
          {Array.from({ length: COLUMNS - row.length }, (_, index) => (
            <View key={`space-${index}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

/** One cell of a choice grid: an icon over a label, ticked by the identity border when selected. */
export function ChoiceCell({
  label,
  selected,
  icon,
  onPress,
  radio = false,
}: {
  label: string;
  selected: boolean;
  icon: ReactNode;
  onPress: () => void;
  /** One choice among several (a radio) rather than one of many that can all be on. */
  radio?: boolean;
}) {
  return (
    // The padding and border sit on the inner button, so every cell of a row gets the same share.
    <View className="flex-1">
      <Pressable
        accessibilityRole={radio ? "radio" : "checkbox"}
        accessibilityState={radio ? { selected } : { checked: selected }}
        accessibilityLabel={label}
        onPress={() => {
          haptic.tick();
          onPress();
        }}
        className={`items-center gap-1.5 rounded-xl border px-1 py-2.5 ${
          selected ? "border-identity bg-identity-soft" : "border-border bg-surface"
        }`}
      >
        {icon}
        <Text
          numberOfLines={1}
          className={`text-caption ${selected ? "font-medium text-foreground" : "text-muted"}`}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

export function EquipmentIcon({ kind }: { kind: Equipment }) {
  const subtle = useSubtleColor();
  const Icon = EQUIPMENT_ICONS[kind];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-lg bg-default"
      style={{ width: TILE, height: TILE }}
    >
      <Icon size={20} color={subtle} />
    </View>
  );
}
