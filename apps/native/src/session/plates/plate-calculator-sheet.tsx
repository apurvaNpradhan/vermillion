import { useRouter } from "expo-router";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatWeight, type LoadPlate, type WeightUnit } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import {
  addToStack,
  clearStack,
  formatDifference,
  hasTarget,
  loadChoices,
  plateGroups,
  overInventory,
  plateRole,
  removeFromStack,
  removeKindFromStack,
  selectedChoice,
  stackCount,
  stackSideKg,
  stackTotalKg,
  type LoadSide,
} from "./plate-view";
import { BarDiagram, PLATE_FILL } from "./bar-diagram";
import { useEquipmentLabel } from "./use-equipment-label";
import { usePlates } from "./use-plates";

export function PlateChip({
  label,
  selected,
  onPress,
  swatch,
  count,
  onRemove,
  removeLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** A colour class for the plate's dot; bars have none. */
  swatch?: string;
  /** In build mode: how many of this plate each side holds. */
  count?: number;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <View
      className={
        selected
          ? "min-h-11 flex-row items-center rounded-xl bg-default"
          : "min-h-11 flex-row items-center rounded-xl border border-separator"
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        className="min-h-11 flex-row items-center gap-2 px-3"
      >
        {swatch ? (
          <View className={`size-3 rounded-full border border-separator ${swatch}`} />
        ) : null}
        <Text className="text-body text-foreground tabular-nums">{label}</Text>
        {count ? (
          <Text className="font-semibold text-body text-foreground tabular-nums">×{count}</Text>
        ) : null}
      </Pressable>
      {count && onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          onPress={onRemove}
          className="min-h-11 min-w-9 items-center justify-center border-l border-separator"
        >
          <Text className="text-body text-muted">−</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

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
        {/* A fixed height and the sheet's own scroll view: a plain ScrollView loses its drags to
            the sheet's pan gesture, so the body could not be scrolled. */}
        <BottomSheet.Content
          snapPoints={["90%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="h-full"
        >
          <View className="px-4 pb-3 pt-2">
            <BottomSheet.Title>{t("plates__title")}</BottomSheet.Title>
          </View>
          {isOpen ? <CalculatorBody state={state} onUse={onUse} onClose={onClose} /> : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

type Mode = "calculate" | "build";

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
  const { bottom } = useSafeAreaInsets();
  const label = useEquipmentLabel();
  const unit = state.barUnit;
  const weight = (kg: number, own: WeightUnit = unit) =>
    t("plates__weight", { weight: formatWeight(kg, own), unit: own });
  const [picked, setPicked] = useState<{ barId: string; side: LoadSide } | null>(null);
  const [mode, setMode] = useState<Mode>("calculate");
  const [stack, setStack] = useState<LoadPlate[]>([]);
  const result = state.result;
  const choices = result ? loadChoices(state.target, result) : [];
  const choice = selectedChoice(
    choices,
    picked && picked.barId === state.bar?.id ? picked.side : null,
  );
  const building = mode === "build";
  const solvedPlates = choice?.load.platesPerSide ?? [];
  const platesPerSide = building ? stack : solvedPlates;
  const barKg = state.bar?.weightKg ?? 0;
  const totalKg = building ? stackTotalKg(barKg, stack) : (choice?.load.totalKg ?? barKg);
  const sideKg = building ? stackSideKg(stack) : (totalKg - barKg) / 2;
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
  const canUse = building ? true : choice !== null;
  const use = async () => {
    if (!canUse || !state.bar) return;
    if (await state.chooseBar(state.bar.id)) {
      onUse(totalKg);
      onClose();
    }
  };
  const changeMode = (next: Mode) => {
    // Entering build mode starts from what the calculator solved, so it can be adjusted.
    if (next === "build" && mode === "calculate") setStack([...solvedPlates]);
    setMode(next);
  };
  const syncing = state.rows.length === 0 && !state.hasSynced;
  const unitPlates = state.rows.flatMap((p) =>
    p.kind === "plate" && p.unit === unit && p.enabled ? [p] : [],
  );
  const over = overInventory(stack, state.plates);
  const loaded = !state.failed && !state.loading;
  return (
    <>
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 px-4 pb-4"
      >
        {state.failed ? (
          <Button variant="secondary" onPress={state.retry}>
            {t("plates__retry")}
          </Button>
        ) : state.loading ? (
          <Text className="text-body text-muted">{t("plates__loading")}</Text>
        ) : (
          <>
            {state.bars.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {state.bars.map((bar) => (
                  <PlateChip
                    key={bar.id}
                    label={label(bar)}
                    selected={bar.id === state.bar?.id}
                    onPress={() => {
                      if (state.bar && bar.unit !== state.bar.unit) setStack([]);
                      void state.chooseBar(bar.id);
                    }}
                  />
                ))}
              </View>
            ) : null}
            {!state.bar ? (
              <Text className="text-body text-muted">
                {syncing ? t("plates__syncing") : t("plates__no_bar")}
              </Text>
            ) : (
              <>
                <SegmentedControl
                  accessibilityLabel={t("plates__mode")}
                  value={mode}
                  onChange={changeMode}
                  options={[
                    { value: "calculate", label: t("plates__mode_calculate") },
                    { value: "build", label: t("plates__mode_build") },
                  ]}
                />
                {!building && choices.length > 1 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {choices.map((option) => (
                      <PlateChip
                        key={option.side}
                        label={t("plates__option", {
                          weight: weight(option.load.totalKg),
                          difference: difference(option.differenceKg),
                        })}
                        selected={option.side === choice?.side}
                        onPress={() => setPicked({ barId: state.bar?.id ?? "", side: option.side })}
                      />
                    ))}
                  </View>
                ) : null}
                <View className="gap-1">
                  {!building && hasTarget(state.target) ? (
                    <Text className="text-label text-muted tabular-nums">
                      {t("plates__target", { weight: weight(state.target) })}
                    </Text>
                  ) : null}
                  <Text className="text-title-lg text-foreground tabular-nums">
                    {t("plates__total", { weight: weight(totalKg) })}
                    {!building && choice && choice.differenceKg === 0
                      ? ` · ${t("plates__exact")}`
                      : null}
                  </Text>
                  <Text className="text-body text-foreground tabular-nums">
                    {platesPerSide.length === 0
                      ? t("plates__bar_weight", { weight: weight(barKg) })
                      : t("plates__side_weight", { weight: weight(sideKg) })}
                  </Text>
                  <Text className="text-body text-muted">{sideText}</Text>
                  {!building &&
                  hasTarget(state.target) &&
                  result &&
                  result.below === null &&
                  !result.exact ? (
                    <Text className="text-body text-muted">{t("plates__below_bar")}</Text>
                  ) : null}
                  {!building && !hasTarget(state.target) ? (
                    <Text className="text-body text-muted">{t("plates__enter_weight")}</Text>
                  ) : !building && !choice ? (
                    <Text className="text-body text-muted">{t("plates__no_load")}</Text>
                  ) : null}
                  {building && over.length > 0 ? (
                    <Text className="text-body text-warning">{t("plates__over_inventory")}</Text>
                  ) : null}
                </View>
                <BarDiagram
                  platesPerSide={platesPerSide}
                  unit={unit}
                  label={sideText}
                  onPlatePress={
                    building ? (index) => setStack(removeFromStack(stack, index)) : undefined
                  }
                  plateLabel={(kg) => t("plates__remove_plate", { weight: weight(kg) })}
                />
                {building ? (
                  <>
                    <View className="flex-row items-center justify-between">
                      <Text className="flex-1 text-label text-muted">
                        {t("plates__build_hint")}
                      </Text>
                      {stack.length > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("plates__clear")}
                          hitSlop={8}
                          className="pl-3"
                          onPress={() => setStack(clearStack())}
                        >
                          <Text className="font-medium text-body text-identity">
                            {t("plates__clear")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {unitPlates.map((p) => (
                        <PlateChip
                          key={p.id}
                          swatch={PLATE_FILL[plateRole(p.weightKg, p.unit)]}
                          label={label(p)}
                          selected={stackCount(stack, p.id) > 0}
                          count={stackCount(stack, p.id)}
                          removeLabel={t("plates__remove_plate", { weight: label(p) })}
                          onRemove={() => setStack(removeKindFromStack(stack, p.id))}
                          onPress={() =>
                            setStack(
                              addToStack(stack, { id: p.id, weightKg: p.weightKg, count: p.count }),
                            )
                          }
                        />
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text className="text-label text-muted">{t("plates__available")}</Text>
                    <Text className="text-body text-muted tabular-nums">
                      {unitPlates.map((p) => label(p)).join(", ")}
                    </Text>
                  </>
                )}
              </>
            )}
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
      </BottomSheetScrollView>
      {loaded && state.bar && canUse ? (
        <View
          className="border-t border-separator px-4 pt-3"
          style={{ paddingBottom: bottom + 12 }}
        >
          <Button variant="primary" onPress={() => void use()}>
            {t("plates__use", { weight: weight(totalKg) })}
          </Button>
        </View>
      ) : null}
    </>
  );
}
