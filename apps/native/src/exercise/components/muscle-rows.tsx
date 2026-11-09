import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_KEYS,
  MUSCLE_REGION,
  MUSCLE_REGIONS,
  MUSCLE_REGION_KEYS,
  type MuscleGroup,
} from "@workspace/shared";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

import { chunked } from "../library/filter-state";
import { MuscleIcon } from "../library/components/muscle-icon";

const COLUMNS = 2;
/** Side of a row's disc. */
export const DISC = 46;

type RowsProps = {
  isSelected: (muscle: MuscleGroup) => boolean;
  onPress: (muscle: MuscleGroup) => void;
  /** One choice among several (a radio) rather than any number that can be on. */
  radio?: boolean;
};

/** Every muscle group under its region heading, in rows of two. */
export function MuscleRegions({
  omit,
  ...props
}: RowsProps & {
  /** A group left out (the primary one, in the secondary picker). */
  omit?: MuscleGroup | null;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-4">
      {MUSCLE_REGIONS.map((region) => (
        <View key={region} className="gap-2">
          <Text accessibilityRole="header" className="text-caption text-muted">
            {t(MUSCLE_REGION_KEYS[region])}
          </Text>
          <MuscleRows
            muscles={MUSCLE_GROUPS.filter(
              (muscle) => muscle !== omit && MUSCLE_REGION[muscle] === region,
            )}
            {...props}
          />
        </View>
      ))}
    </View>
  );
}

/** Rows of two equal cells; a short last row is padded so its cell keeps the same width. */
export function MuscleRows({
  muscles,
  isSelected,
  onPress,
  radio = false,
}: RowsProps & { muscles: readonly MuscleGroup[] }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      {chunked(muscles, COLUMNS).map((row) => (
        <View key={row.join()} className="flex-row gap-2">
          {row.map((muscle) => {
            const selected = isSelected(muscle);
            const label = t(MUSCLE_GROUP_KEYS[muscle]);
            return (
              <View key={muscle} className="flex-1">
                <Pressable
                  accessibilityRole={radio ? "radio" : "checkbox"}
                  accessibilityState={radio ? { selected } : { checked: selected }}
                  accessibilityLabel={label}
                  onPress={() => {
                    haptic.tick();
                    onPress(muscle);
                  }}
                  className={`flex-row items-center gap-3 rounded-2xl border p-2 ${
                    selected ? "border-identity bg-identity-soft" : "border-border bg-surface"
                  }`}
                >
                  <MuscleIcon muscle={muscle} size={DISC} />
                  <Text
                    numberOfLines={2}
                    className={`flex-1 text-label ${selected ? "font-medium text-foreground" : "text-muted"}`}
                  >
                    {label}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {Array.from({ length: COLUMNS - row.length }, (_, index) => (
            <View key={`space-${index}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
