import { useRouter } from "expo-router";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatWeight, type WeightUnit } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import {
  formatDifference,
  hasTarget,
  loadChoices,
  plateGroups,
  plateRole,
  selectedChoice,
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
  const totalKg = choice?.load.totalKg ?? state.bar?.weightKg ?? 0;
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
  const barKg = state.bar?.weightKg ?? 0;
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
  return (
    <>
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
          ) : (
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
                      selected={option.side === choice?.side}
                      onPress={() => setPicked({ barId: state.bar?.id ?? "", side: option.side })}
                    />
                  ))}
                </View>
              ) : null}
              <View className="gap-1">
                {hasTarget(state.target) ? (
                  <Text className="text-label text-muted tabular-nums">
                    {t("plates__target", { weight: weight(state.target) })}
                  </Text>
                ) : null}
                <Text className="text-title-md text-foreground tabular-nums">
                  {t("plates__total", { weight: weight(totalKg) })}
                  {choice && choice.differenceKg === 0 ? ` · ${t("plates__exact")}` : null}
                </Text>
                <Text className="text-body text-foreground tabular-nums">
                  {platesPerSide.length === 0
                    ? t("plates__bar_weight", { weight: weight(barKg) })
                    : t("plates__side_weight", { weight: weight((totalKg - barKg) / 2) })}
                </Text>
                <Text className="text-body text-muted">{sideText}</Text>
                {hasTarget(state.target) && result && result.below === null && !result.exact ? (
                  <Text className="text-body text-muted">{t("plates__below_bar")}</Text>
                ) : null}
                {!hasTarget(state.target) ? (
                  <Text className="text-body text-muted">{t("plates__enter_weight")}</Text>
                ) : !choice ? (
                  <Text className="text-body text-muted">{t("plates__no_load")}</Text>
                ) : null}
              </View>
              <BarDiagram platesPerSide={platesPerSide} unit={unit} label={sideText} />
              {choice ? (
                <Button variant="primary" onPress={() => void use()}>
                  {t("plates__use", { weight: weight(choice.load.totalKg) })}
                </Button>
              ) : null}
            </>
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
                            swatch={PLATE_FILL[plateRole(p.weightKg, p.unit)]}
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
