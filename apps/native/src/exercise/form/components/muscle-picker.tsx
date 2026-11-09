import type { MuscleGroup } from "@workspace/shared";
import { useState } from "react";
import { Text, View } from "react-native";

import { BodyMapPair, UNDRAWN } from "@/body-map";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { SegmentedControl } from "@/platform/ui/segmented-control";

import { MuscleRegions, MuscleRows } from "../../components/muscle-rows";

type View_ = "body" | "list";

/**
 * Chooses the primary muscle group: the body map (tap a group) or the grouped list, switched by
 * a Body / List toggle. Exactly one group is selected.
 */
export function PrimaryMusclePicker({
  value,
  onChange,
}: {
  value: MuscleGroup | null;
  onChange: (muscle: MuscleGroup) => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View_>("list");
  const selected = value === null ? [] : [value];
  return (
    <View className="gap-4">
      <SegmentedControl<View_>
        options={[
          { value: "body", label: t("exercise__view_body") },
          { value: "list", label: t("exercise__view_list") },
        ]}
        value={view}
        onChange={setView}
        accessibilityLabel={t("exercise__view_group")}
      />
      {view === "body" ? (
        <View className="gap-4">
          <BodyMapPair
            selected={selected}
            onPressGroup={(muscle) => {
              haptic.tick();
              onChange(muscle);
            }}
          />
          <Text className="text-center text-caption text-muted">
            {t("exercise__form_body_hint")}
          </Text>
          <MuscleRows
            muscles={UNDRAWN}
            radio
            isSelected={(muscle) => value === muscle}
            onPress={onChange}
          />
        </View>
      ) : (
        <MuscleRegions radio isSelected={(muscle) => value === muscle} onPress={onChange} />
      )}
    </View>
  );
}

/** Chooses any number of secondary groups, never the primary one. */
export function SecondaryMusclePicker({
  primary,
  value,
  onToggle,
}: {
  primary: MuscleGroup | null;
  value: readonly MuscleGroup[];
  onToggle: (muscle: MuscleGroup) => void;
}) {
  return (
    <MuscleRegions
      omit={primary}
      isSelected={(muscle) => value.includes(muscle)}
      onPress={onToggle}
    />
  );
}
