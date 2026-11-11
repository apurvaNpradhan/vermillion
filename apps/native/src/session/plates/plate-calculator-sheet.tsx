import { useRouter } from "expo-router";
import { BottomSheet, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import Svg, { Rect, Text as SvgText, G } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { formatWeight, KG_PER_LB, type LoadPlate, type WeightUnit } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { isColorString } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import {
  formatDifference,
  hasTarget,
  loadChoices,
  plateGroups,
  plateLayout,
  selectedChoice,
  type LoadSide,
  type PlateSlot,
} from "./plate-view";
import { useEquipmentLabel } from "./use-equipment-label";
import { usePlates } from "./use-plates";

export function PlateChip({
  label,
  selected,
  onPress,
  swatch,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** A colour class for the plate's dot; bars have none. */
  swatch?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={
        selected
          ? "min-h-11 flex-row items-center gap-2 rounded-xl bg-default px-3"
          : "min-h-11 flex-row items-center gap-2 rounded-xl border border-separator px-3"
      }
    >
      {swatch ? <View className={`size-3 rounded-full border border-separator ${swatch}`} /> : null}
      <Text className="text-body text-foreground tabular-nums">{label}</Text>
    </Pressable>
  );
}

type PlateRole = "red" | "blue" | "yellow" | "green" | "white" | "black";

/** The competition colour of a plate by its weight in the kit's unit. */
function plateRole(weightKg: number, unit: WeightUnit): PlateRole {
  // Rounded, so a converted 45 lb plate is not 44.999… lb.
  const weight = Math.round((unit === "lb" ? weightKg / KG_PER_LB : weightKg) * 100) / 100;
  if (weight >= (unit === "lb" ? 55 : 25)) return "red";
  if (weight >= (unit === "lb" ? 45 : 20)) return "blue";
  if (weight >= (unit === "lb" ? 35 : 15)) return "yellow";
  if (weight >= 10) return "green";
  if (weight >= 5) return "white";
  return "black";
}

// Class and variable names are written out whole: styles are generated only for the names the
// source spells out, so a name built from a template is never defined.
const SWATCH: Record<PlateRole, string> = {
  red: "bg-plate-red",
  blue: "bg-plate-blue",
  yellow: "bg-plate-yellow",
  green: "bg-plate-green",
  white: "bg-plate-white",
  black: "bg-plate-black",
};
const FILL: Record<PlateRole, string> = {
  red: "--color-plate-red",
  blue: "--color-plate-blue",
  yellow: "--color-plate-yellow",
  green: "--color-plate-green",
  white: "--color-plate-white",
  black: "--color-plate-black",
};

function PlateDrawing({
  plate,
  unit,
  slot,
  label,
}: {
  plate: LoadPlate;
  unit: WeightUnit;
  slot: PlateSlot;
  label: string;
}) {
  const role = plateRole(plate.weightKg, unit);
  const fill = useCSSVariable(FILL[role]);
  const ink = useCSSVariable(
    role === "yellow" || role === "white" ? "--color-on-plate-light" : "--color-on-plate-dark",
  );
  const height = Math.min(140, 45 + plate.weightKg * 4);
  const edge = useThemeColor("muted");
  return (
    <G>
      <Rect
        x={slot.x}
        y={(160 - height) / 2}
        width={slot.width}
        height={height}
        rx={3}
        fill={isColorString(fill) ? fill : undefined}
        // A dark plate would vanish on the dark sheet without an edge.
        stroke={edge}
        strokeOpacity={0.5}
        strokeWidth={1}
      />
      {slot.showLabel ? (
        <SvgText
          x={slot.x + slot.width / 2}
          y={84}
          fontSize={10}
          textAnchor="middle"
          fill={isColorString(ink) ? ink : undefined}
        >
          {label}
        </SvgText>
      ) : null}
    </G>
  );
}

/** Keeps content mounted through the sheet's close animation, then lets it go. */
/**
 * The plate calculator for one exercise's bar. It stays mounted and `isOpen` opens it, but its
 * body is rendered only while open, and closed sheets disable inventory watches and solving.
 */
export function PlateCalculatorSheet({
  isOpen,
  targetKg,
  exerciseId,
  onUse,
  onClose,
}: {
  /** The sheet stays mounted and opens on a change to true; mounting it open shows nothing. */
  isOpen: boolean;
  /** Fixed for as long as the sheet is open; the caller captures it when opening. */
  targetKg: number;
  exerciseId: string;
  onUse: (weightKg: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  // Data hooks stay above the portal host; closed sheets subscribe to neither inventory nor bars.
  const state = usePlates(targetKg, exerciseId, isOpen);
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <BottomSheet.Title>{t("plates__title")}</BottomSheet.Title>
          {isOpen ? <CalculatorBody state={state} onUse={onUse} onClose={onClose} /> : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function CalculatorBody({
  state,
  onUse,
  onClose,
}: {
  state: ReturnType<typeof usePlates>;
  onUse: (weightKg: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const label = useEquipmentLabel();
  const metal = useThemeColor("muted");
  const unit = state.barUnit;
  const weight = (kg: number, own: WeightUnit = unit) =>
    t("plates__weight", { weight: formatWeight(kg, own), unit: own });
  const [picked, setPicked] = useState<{ barId: string; side: LoadSide } | null>(null);
  const result = state.result;
  const choices = result ? loadChoices(state.target, result) : [];
  const choice = selectedChoice(
    choices,
    picked && picked.barId === state.bar?.id ? picked.side : null,
  );
  const platesPerSide = choice?.load.platesPerSide ?? [];
  const layout = plateLayout(platesPerSide, (kg) => formatWeight(kg, unit));
  const sideText =
    platesPerSide.length === 0
      ? t("plates__bare_bar")
      : t("plates__per_side", {
          plates: plateGroups(platesPerSide)
            .map((group) =>
              group.count === 1
                ? weight(group.weightKg)
                : t("plates__plate_count", { count: group.count, weight: weight(group.weightKg) }),
            )
            .join(", "),
        });
  const difference = (kg: number) =>
    t(kg < 0 ? "plates__under" : "plates__over", {
      weight: t("plates__weight", { weight: formatDifference(kg, unit), unit }),
    });
  const use = async () => {
    if (!choice || !state.bar) return;
    if (await state.chooseBar(state.bar.id)) {
      onUse(choice.load.totalKg);
      onClose();
    }
  };
  const syncing = state.rows.length === 0 && !state.hasSynced;
  const barWidth = layout.width;
  return (
    <>
      {hasTarget(state.target) ? (
        <Text className="text-title-md text-foreground tabular-nums">
          {t("plates__target", { weight: weight(state.target) })}
        </Text>
      ) : null}
      {state.failed ? (
        <Button variant="secondary" onPress={state.retry}>
          {t("plates__retry")}
        </Button>
      ) : state.loading ? (
        <Text className="text-body text-muted">{t("plates__loading")}</Text>
      ) : (
        <>
          {state.bars.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {state.bars.map((bar) => (
                  <PlateChip
                    key={bar.id}
                    label={label(bar)}
                    selected={bar.id === state.bar?.id}
                    onPress={() => void state.chooseBar(bar.id)}
                  />
                ))}
              </View>
            </ScrollView>
          ) : null}
          {!state.bar ? (
            <Text className="text-body text-muted">
              {syncing ? t("plates__syncing") : t("plates__no_bar")}
            </Text>
          ) : !hasTarget(state.target) ? (
            <Text className="text-body text-muted">{t("plates__enter_weight")}</Text>
          ) : choice ? (
            <>
              {choices.length > 1 ? (
                <View className="flex-row flex-wrap gap-2">
                  {choices.map((option) => (
                    <PlateChip
                      key={option.side}
                      label={t("plates__option", {
                        weight: weight(option.load.totalKg),
                        difference: difference(option.differenceKg),
                      })}
                      selected={option.side === choice.side}
                      onPress={() => setPicked({ barId: state.bar?.id ?? "", side: option.side })}
                    />
                  ))}
                </View>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Svg
                  width={barWidth}
                  height={160}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={sideText}
                >
                  <Rect x={0} y={74} width={barWidth} height={12} fill={metal} />
                  <Rect x={35} y={57} width={12} height={46} rx={2} fill={metal} />
                  {platesPerSide.map((plate, i) => {
                    const slot = layout.slots[i];
                    return slot ? (
                      <PlateDrawing
                        key={`${plate.id}-${i}`}
                        plate={plate}
                        unit={unit}
                        slot={slot}
                        label={formatWeight(plate.weightKg, unit)}
                      />
                    ) : null;
                  })}
                </Svg>
              </ScrollView>
              <View className="gap-1">
                <Text className="text-body text-foreground">{sideText}</Text>
                <Text className="text-body text-muted tabular-nums">
                  {t("plates__total", { weight: weight(choice.load.totalKg) })}
                  {choice.differenceKg === 0 ? ` · ${t("plates__exact")}` : null}
                </Text>
                {result && result.below === null && !result.exact ? (
                  <Text className="text-body text-muted">{t("plates__below_bar")}</Text>
                ) : null}
              </View>
              <Button variant="primary" onPress={() => void use()}>
                {t("plates__use", { weight: weight(choice.load.totalKg) })}
              </Button>
            </>
          ) : (
            <Text className="text-body text-muted">{t("plates__no_load")}</Text>
          )}
          {state.bar ? (
            <>
              <Text className="text-label text-muted">{t("plates__available")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {state.rows.flatMap((p) =>
                    p.kind === "plate" && p.unit === unit
                      ? [
                          <PlateChip
                            key={p.id}
                            swatch={SWATCH[plateRole(p.weightKg, p.unit)]}
                            label={label(p)}
                            selected={p.enabled}
                            onPress={() => void state.toggle(p)}
                          />,
                        ]
                      : [],
                  )}
                </View>
              </ScrollView>
            </>
          ) : null}
        </>
      )}
      <Button
        variant="ghost"
        onPress={() => {
          onClose();
          router.push("/session/equipment");
        }}
      >
        {t("plates__manage")}
      </Button>
      <Button variant="ghost" onPress={onClose}>
        {t("plates__close")}
      </Button>
    </>
  );
}
