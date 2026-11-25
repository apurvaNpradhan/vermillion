import { MUSCLE_GROUP_KEYS, type MuscleDetail, type MuscleGroup } from "@workspace/shared";
import { useMemo, useState } from "react";
import { Image, Pressable, View, type GestureResponderEvent, type ViewStyle } from "react-native";
import Svg, { Defs, FeColorMatrix, Filter, G, Image as SvgImage } from "react-native-svg";

import { useTranslation } from "@/platform/i18n";

import { muscleArtTint, tintOpacity } from "../core/ramp";
import { BODY_ASPECT, BODY_CANVAS } from "../core/body-canvas";
import { layerAlphas } from "../core/detail-layers";
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
  /**
   * Parts of the groups above to light instead of the whole group (an exercise's muscle details).
   * A group with none of its details listed is lit whole.
   */
  details?: readonly MuscleDetail[];
  /** 0..1 per group (clamped), replacing the primary and secondary opacities: a heat map. */
  intensity?: Partial<Record<BodyGroup, number>>;
  /** Optional recolouring of the shaded artwork for the weekly muscle map. */
  artTint?: ReturnType<typeof muscleArtTint>;
  /** Groups drawn in full as chosen (the filter's selection, the group just tapped). */
  selected?: readonly MuscleGroup[];
  /** Called with the group under a tap, or from an accessibility action; never a coordinate. */
  onPressGroup?: (group: BodyGroup) => void;
  style?: ViewStyle;
};

const FILL = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" } as const;

/**
 * Highlights use the original red artwork at the group's opacity by default.
 * The picture cannot be focused part by part, so each highlighted group is also an accessibility
 * action.
 */
export function BodyMap({
  view,
  primary,
  secondary,
  details,
  intensity,
  artTint,
  selected,
  onPressGroup,
  style,
}: BodyMapProps) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const alphas = useMemo(
    () => groupAlphas({ primary, secondary, intensity, selected }),
    [primary, secondary, intensity, selected],
  );
  const layers = useMemo(() => layerAlphas(view, alphas, details), [view, alphas, details]);
  const actions = useMemo(
    () =>
      BODY_GROUPS.flatMap((group) => {
        if (!alphas.has(group) || (onPressGroup && GROUP_LAYERS[group][view].length === 0)) {
          return [];
        }
        const name = t(MUSCLE_GROUP_KEYS[group]);
        const chosen = selected?.includes(group) ?? false;
        let label = name;
        if (chosen) label = t("bodymap__group_selected", { name });
        else if (primary?.includes(group)) label = t("bodymap__group_primary", { name });
        else if (!onPressGroup && secondary?.includes(group)) {
          label = t("bodymap__group_secondary", { name });
        }
        return [{ name: group, label, chosen }];
      }),
    [alphas, onPressGroup, primary, secondary, selected, t, view],
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
      accessibilityState={
        onPressGroup ? { selected: actions.some((action) => action.chosen) } : undefined
      }
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
        {artTint ? (
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${BODY_CANVAS.width} ${BODY_CANVAS.height}`}
          >
            <Defs>
              <Filter id="body-shading">
                <FeColorMatrix values={artTint.body} />
              </Filter>
              <Filter id="muscle-shading">
                <FeColorMatrix values={artTint.muscle} />
              </Filter>
            </Defs>
            <SvgImage
              href={LAYER_SOURCES[BASE_LAYERS[view]]}
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              filter="url(#body-shading)"
            />
            <G filter="url(#muscle-shading)">
              {layers.map(({ layer, opacity }) => (
                <SvgImage
                  key={layer}
                  href={LAYER_SOURCES[layer]}
                  width="100%"
                  height="100%"
                  preserveAspectRatio="none"
                  opacity={tintOpacity(opacity)}
                />
              ))}
            </G>
          </Svg>
        ) : (
          <>
            <Image source={LAYER_SOURCES[BASE_LAYERS[view]]} resizeMode="stretch" style={FILL} />
            {layers.map(({ layer, opacity }) => (
              <Image
                key={layer}
                source={LAYER_SOURCES[layer]}
                resizeMode="stretch"
                style={[FILL, { opacity }]}
              />
            ))}
          </>
        )}
      </View>
    </Pressable>
  );
}
