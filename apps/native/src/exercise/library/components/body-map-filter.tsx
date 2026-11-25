import {
  MUSCLE_DETAIL_KEYS,
  detailsOf,
  groupOf,
  type MuscleDetail,
  type MuscleGroup,
} from "@workspace/shared";
import { nativeColors } from "@workspace/ui/tokens/brand";
import { memo, useCallback, useMemo } from "react";
import { View } from "react-native";

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
      {details.length > 0 ? (
        <View className="flex-row flex-wrap justify-center gap-2">
          {details.map((part) => (
            <Button
              key={part}
              size="sm"
              variant={detail === part ? "secondary" : "ghost"}
              accessibilityState={{ selected: detail === part }}
              onPress={() => onSelect([groupOf(part)], detail === part ? null : part)}
            >
              <Button.Label>{t(MUSCLE_DETAIL_KEYS[part])}</Button.Label>
            </Button>
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
