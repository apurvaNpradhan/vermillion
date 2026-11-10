import { useRouter } from "expo-router";
import { BottomSheet, useThemeColor } from "heroui-native";
import { Text, View, ScrollView, Pressable } from "react-native";
import Svg, { Rect, Text as SvgText, G } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { formatWeight, KG_PER_LB, type LoadPlate } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { isColorString } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { usePlates } from "./use-plates";

export function PlateChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={
        selected
          ? "min-h-11 justify-center rounded-xl bg-default px-3"
          : "min-h-11 justify-center rounded-xl border border-separator px-3"
      }
    >
      <Text className="text-body text-foreground tabular-nums">{label}</Text>
    </Pressable>
  );
}

function PlateDrawing({
  plate,
  x,
  label,
}: {
  plate: LoadPlate & { unit?: "kg" | "lb" };
  x: number;
  label: string;
}) {
  const weight = plate.unit === "lb" ? plate.weightKg / KG_PER_LB : plate.weightKg;
  const role =
    weight >= (plate.unit === "lb" ? 55 : 25)
      ? "red"
      : weight >= (plate.unit === "lb" ? 45 : 20)
        ? "blue"
        : weight >= (plate.unit === "lb" ? 35 : 15)
          ? "yellow"
          : weight >= 10
            ? "green"
            : weight >= 5
              ? "white"
              : "black";
  const fill = useCSSVariable(`--color-plate-${role}`);
  const ink = useCSSVariable(
    role === "yellow" || role === "white" ? "--color-on-plate-light" : "--color-on-plate-dark",
  );
  const height = Math.min(140, 45 + plate.weightKg * 4);
  const width = Math.min(36, 22 + plate.weightKg / 2);
  return (
    <G>
      <Rect
        x={x}
        y={(160 - height) / 2}
        width={width}
        height={height}
        rx={3}
        fill={isColorString(fill) ? fill : undefined}
      />
      <SvgText
        x={x + width / 2}
        y={84}
        fontSize={10}
        textAnchor="middle"
        fill={isColorString(ink) ? ink : undefined}
      >
        {label}
      </SvgText>
    </G>
  );
}

/** Mount while open. A missing exercise id is only for the temporary Settings preview. */
export function PlateCalculatorSheet({
  targetKg,
  exerciseId,
  onUse,
  onClose,
}: {
  targetKg: number;
  exerciseId: string;
  onUse: (weightKg: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const state = usePlates(targetKg, exerciseId);
  const metal = useThemeColor("muted");
  const weight = (kg: number) =>
    t("plates__weight", { weight: formatWeight(kg, state.unit), unit: state.unit });
  const result = state.result;
  return (
    <BottomSheet
      isOpen
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
          <Text className="text-title-md text-foreground tabular-nums">
            {t("plates__target", { weight: weight(targetKg) })}
          </Text>
          {state.failed ? (
            <Button variant="secondary" onPress={state.retry}>
              {t("plates__retry")}
            </Button>
          ) : state.loading ? (
            <Text className="text-body text-muted">{t("plates__loading")}</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {state.bars.map((bar) => (
                    <PlateChip
                      key={bar.id}
                      label={t("plates__bar_label", {
                        name: bar.label ?? "",
                        weight: weight(bar.weightKg),
                      })}
                      selected={bar.id === state.bar?.id}
                      onPress={() => void state.chooseBar(bar.id)}
                    />
                  ))}
                </View>
              </ScrollView>
              {result ? (
                <>
                  <ScrollView horizontal>
                    <Svg
                      width={Math.max(300, 80 + result.platesPerSide.length * 40)}
                      height={160}
                      accessibilityLabel={t("plates__one_side", { weight: weight(result.totalKg) })}
                    >
                      <Rect
                        x={0}
                        y={74}
                        width={Math.max(300, 80 + result.platesPerSide.length * 40)}
                        height={12}
                        fill={metal}
                      />
                      <Rect x={35} y={57} width={12} height={46} rx={2} fill={metal} />
                      {result.platesPerSide.map((plate, i) => (
                        <PlateDrawing
                          key={`${plate.id}-${i}`}
                          plate={plate}
                          x={55 + i * 40}
                          label={formatWeight(plate.weightKg, state.unit)}
                        />
                      ))}
                    </Svg>
                  </ScrollView>
                  <Text className="text-body text-foreground">
                    {t("plates__one_side", { weight: weight(result.totalKg) })}
                  </Text>
                  {!result.exact ? (
                    <Text className="text-body text-muted">
                      {t("plates__closest", {
                        below: result.below ? weight(result.below.totalKg) : t("plates__none"),
                        above: result.above ? weight(result.above.totalKg) : t("plates__none"),
                      })}
                    </Text>
                  ) : null}
                  {(result.exact ? [result] : [result.below, result.above]).map((load, i) =>
                    load ? (
                      <Button
                        key={i}
                        variant={i === 0 ? "primary" : "secondary"}
                        onPress={() => {
                          void (async () => {
                            if (state.bar && (await state.chooseBar(state.bar.id))) {
                              onUse(load.totalKg);
                              onClose();
                            }
                          })();
                        }}
                      >
                        {t("plates__use", { weight: weight(load.totalKg) })}
                      </Button>
                    ) : null,
                  )}
                </>
              ) : (
                <Text className="text-body text-muted">{t("plates__no_bar")}</Text>
              )}
              <Text className="text-label text-muted">{t("plates__available")}</Text>
              <ScrollView horizontal>
                <View className="flex-row gap-2">
                  {state.rows.flatMap((p) =>
                    p.kind === "plate"
                      ? [
                          <PlateChip
                            key={p.id}
                            label={weight(p.weightKg)}
                            selected={p.enabled}
                            onPress={() => void state.toggle(p)}
                          />,
                        ]
                      : [],
                  )}
                </View>
              </ScrollView>
            </>
          )}
          <Button
            variant="ghost"
            onPress={() => {
              onClose();
              router.push({ pathname: "/settings/plates", params: { calculator: "closed" } });
            }}
          >
            {t("plates__manage")}
          </Button>
          <Button variant="ghost" onPress={onClose}>
            {t("plates__close")}
          </Button>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
