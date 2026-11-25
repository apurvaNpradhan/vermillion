import {
  MUSCLE_DETAIL_KEYS,
  MUSCLE_GROUP_KEYS,
  MUSCLE_GROUPS,
  detailsOf,
  groupOf,
  type MuscleDetail,
  type MuscleGroup,
} from "@workspace/shared";
import { nativeColors } from "@workspace/ui/tokens/brand";
import { memo, useCallback, useMemo } from "react";
import { ScrollView, View } from "react-native";

import { BODY_GROUPS, BodyMapPair, muscleArtTint, type BodyGroup } from "@/body-map";
import { useTranslation } from "@/platform/i18n";
import { useThemeMode } from "@/platform/theme";
import { Button } from "@/platform/ui/button";

const FIGURE_PAIR_STYLE = { width: "100%" } as const;

export const BodyMapFilter = memo(function BodyMapFilter({
  muscles,
  detail,
  onSelect,
}: {
  muscles: readonly MuscleGroup[];
  detail: MuscleDetail | null;
  onSelect: (muscles: readonly MuscleGroup[], detail: MuscleDetail | null) => void;
}) {
  const { t } = useTranslation();
  const mode = useThemeMode();
  const artTint = useMemo(
    () => muscleArtTint(nativeColors[`mono-${mode}`]["accent-text"], mode === "dark"),
    [mode],
  );
  const selectedGroup = muscles.length === 1 ? muscles[0] : undefined;
  const details = selectedGroup === undefined ? [] : detailsOf(selectedGroup);
  const onPressGroup = useCallback((group: BodyGroup) => onSelect([group], null), [onSelect]);

  return (
    <View className="items-center gap-2 pb-2">
      <BodyMapPair
        style={FIGURE_PAIR_STYLE}
        maxFigureWidth={116}
        artTint={artTint}
        secondary={BODY_GROUPS}
        selected={muscles}
        details={detail === null ? undefined : [detail]}
        onPressGroup={onPressGroup}
      />
      <ScrollView
        horizontal
        className="w-full"
        contentContainerClassName="gap-2 pb-2"
        keyboardShouldPersistTaps="handled"
      >
        {MUSCLE_GROUPS.map((group) => (
          <MuscleChip
            key={group}
            label={t(MUSCLE_GROUP_KEYS[group])}
            selected={muscles.includes(group)}
            onPress={() => onSelect([group], null)}
          />
        ))}
      </ScrollView>
      {details.length > 0 ? (
        <View className="flex-row flex-wrap justify-center gap-2">
          {details.map((part) => (
            <MuscleChip
              key={part}
              label={t(MUSCLE_DETAIL_KEYS[part])}
              selected={detail === part}
              onPress={() => onSelect([groupOf(part)], detail === part ? null : part)}
            />
          ))}
        </View>
      ) : null}
      {muscles.length > 0 ? (
        <Button size="sm" variant="ghost" onPress={() => onSelect([], null)}>
          <Button.Label>{t("exercise__clear_muscle")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
});

function MuscleChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="secondary"
      className={
        selected ? "min-h-11 min-w-11 rounded-full bg-accent" : "min-h-11 min-w-11 rounded-full"
      }
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      <Button.Label className={selected ? "text-accent-foreground" : "text-foreground"}>
        {label}
      </Button.Label>
    </Button>
  );
}
