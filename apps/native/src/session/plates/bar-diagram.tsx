import { useState } from "react";
import { Text, View } from "react-native";
import { formatWeight, type LoadPlate, type WeightUnit } from "@workspace/shared";
import { plateLayout, plateRole, type PlateRole } from "./plate-view";

// Class names are written out whole: styles are generated only for the names the source spells
// out, so a name built from a template is never defined.
export const PLATE_FILL: Record<PlateRole, string> = {
  red: "bg-plate-red",
  blue: "bg-plate-blue",
  yellow: "bg-plate-yellow",
  green: "bg-plate-green",
  white: "bg-plate-white",
  black: "bg-plate-black",
};
const PLATE_INK: Record<PlateRole, string> = {
  red: "text-on-plate-dark",
  blue: "text-on-plate-dark",
  yellow: "text-on-plate-light",
  green: "text-on-plate-dark",
  white: "text-on-plate-light",
  black: "text-on-plate-dark",
};

/**
 * One side of a barbell seen from the front: the shaft, the collar and the plates stacked on the
 * sleeve, heaviest nearest the collar. Plates are as tall and thick as their weight suggests, in
 * competition colours, and each says its weight. Drawn with views so it needs no native module.
 */
export function BarDiagram({
  platesPerSide,
  unit,
  label,
}: {
  platesPerSide: readonly LoadPlate[];
  unit: WeightUnit;
  /** Read by screen readers instead of the drawing. */
  label: string;
}) {
  const [width, setWidth] = useState(320);
  const layout = plateLayout(platesPerSide, (kg) => formatWeight(kg, unit), width);
  const middle = layout.height / 2;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(Math.max(160, event.nativeEvent.layout.width))}
      className="w-full"
      style={{ height: layout.height }}
    >
      <View
        className="absolute rounded-sm bg-muted"
        style={{ left: 0, width: layout.collarX, top: middle - 4, height: 8 }}
      />
      <View
        className="absolute rounded-sm bg-muted/70"
        style={{
          left: layout.collarX,
          width: layout.width - layout.collarX,
          top: middle - 7,
          height: 14,
        }}
      />
      <View
        className="absolute rounded-sm border border-separator bg-muted"
        style={{
          left: layout.collarX,
          width: layout.collarWidth,
          top: middle - layout.collarHeight / 2,
          height: layout.collarHeight,
        }}
      />
      {platesPerSide.map((plate, index) => {
        const slot = layout.slots[index];
        if (!slot) return null;
        const role = plateRole(plate.weightKg, unit);
        return (
          <View
            key={`${plate.id}-${index}`}
            className={`absolute items-center justify-center rounded-[3px] border border-muted/60 ${PLATE_FILL[role]}`}
            style={{
              left: slot.x,
              width: slot.width,
              top: middle - slot.height / 2,
              height: slot.height,
            }}
          >
            {slot.showLabel ? (
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                className={`text-[10px] font-semibold tabular-nums ${PLATE_INK[role]}`}
                style={{
                  width: slot.height,
                  textAlign: "center",
                  transform: [{ rotate: "-90deg" }],
                }}
              >
                {formatWeight(plate.weightKg, unit)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
