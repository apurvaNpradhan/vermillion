import { MUSCLE_GROUP_KEYS, type MuscleGroup } from "@workspace/shared";
import { useMemo, useState } from "react";
import { Image, Pressable, View, type GestureResponderEvent, type ViewStyle } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { BODY_ASPECT } from "../core/body-canvas";
import { BASE_LAYERS, GROUP_LAYERS } from "../core/group-layers";
import { groupAt } from "../core/hit-test";
import { BODY_GROUPS, type BodyGroup, type BodyView } from "../core/groups";
import { groupAlphas } from "../core/intensity";
import { LAYER_SOURCES } from "./layer-sources.generated";

export type BodyMapProps = {
  view: BodyView;
  /** Groups drawn in full. Groups with no drawing (cardio, full body, other) are ignored. */
  primary?: readonly MuscleGroup[];
  /** Groups drawn lighter. */
  secondary?: readonly MuscleGroup[];
  /** 0..1 per group (clamped), replacing the primary and secondary opacities: a heat map. */
  intensity?: Partial<Record<BodyGroup, number>>;
  /** Groups drawn in full as chosen (the filter's selection, the group just tapped). */
  selected?: readonly MuscleGroup[];
  /** Called with the group under a tap, or from an accessibility action; never a coordinate. */
  onPressGroup?: (group: BodyGroup) => void;
  /**
   * One colour for every highlighted muscle instead of its drawn colour, so a heat map reads as
   * one tone getting stronger (the theme's foreground: white on dark, ink on light).
   */
  tint?: string;
  style?: ViewStyle;
};

const FILL = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" } as const;

/**
 * The body with groups highlighted, as drawn: the grey anatomy untinted, each highlighted group's
 * muscle layers in their own colour at the group's opacity (primary 1, secondary lighter, an
 * intensity as given). It fills the width of its box and keeps the body's proportions.
 * The picture cannot be focused part by part, so each highlighted group is also an accessibility
 * action.
 */
export function BodyMap({
  view,
  primary,
  secondary,
  intensity,
  selected,
  onPressGroup,
  tint,
  style,
}: BodyMapProps) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const alphas = useMemo(
    () => groupAlphas({ primary, secondary, intensity, selected }),
    [primary, secondary, intensity, selected],
  );
  const actions = useMemo(
    () =>
      BODY_GROUPS.flatMap((group) => {
        if (!alphas.has(group)) return [];
        const name = t(MUSCLE_GROUP_KEYS[group]);
        const label = primary?.includes(group)
          ? t("bodymap__group_primary", { name })
          : secondary?.includes(group)
            ? t("bodymap__group_secondary", { name })
            : name;
        return [{ name: group, label }];
      }),
    [alphas, primary, secondary, t],
  );

  const onPress = (event: GestureResponderEvent) => {
    if (size.width === 0 || size.height === 0) return;
    const group = groupAt(
      view,
      event.nativeEvent.locationX / size.width,
      event.nativeEvent.locationY / size.height,
      new Set(alphas.keys()),
    );
    if (group !== undefined) onPressGroup?.(group);
  };

  const viewLabel = t(view === "front" ? "bodymap__view_front" : "bodymap__view_back");
  return (
    <Pressable
      accessible
      accessibilityRole={onPressGroup ? "button" : "image"}
      accessibilityLabel={
        actions.length > 0
          ? `${viewLabel}. ${actions.map((action) => action.label).join(". ")}`
          : `${viewLabel}. ${t("bodymap__none")}`
      }
      accessibilityHint={onPressGroup ? t("bodymap__hint") : undefined}
      accessibilityActions={onPressGroup ? actions : undefined}
      onAccessibilityAction={(event) => {
        const action = actions.find((candidate) => candidate.name === event.nativeEvent.actionName);
        if (action) onPressGroup?.(action.name);
      }}
      disabled={!onPressGroup}
      onPress={onPress}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
      style={[{ width: "100%", aspectRatio: BODY_ASPECT }, style]}
    >
      <View pointerEvents="none" style={FILL}>
        <Image source={LAYER_SOURCES[BASE_LAYERS[view]]} resizeMode="stretch" style={FILL} />
        {BODY_GROUPS.flatMap((group) => {
          const alpha = alphas.get(group);
          if (alpha === undefined) return [];
          return GROUP_LAYERS[group][view].map((layer) => (
            <Image
              key={layer}
              source={LAYER_SOURCES[layer]}
              resizeMode="stretch"
              style={[FILL, { opacity: alpha, tintColor: tint }]}
            />
          ));
        })}
      </View>
    </Pressable>
  );
}
