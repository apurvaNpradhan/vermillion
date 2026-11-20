import {
  DEFAULT_WARMUP_STEPS,
  WARMUP_STEPS_MAX,
  WARMUP_ROUNDINGS,
  type WarmupRounding,
  type WarmupStep,
} from "@workspace/shared";
import { ArrowCounterClockwise, Plus, Trash } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { ScrollPage } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { Stepper } from "@/training";

const PERCENT_STEP = 5;
const PERCENT_MIN = 10;
const PERCENT_MAX = 95;
const REPS_MIN = 1;
const REPS_MAX = 30;

const ROUNDING_KEYS = {
  equipment: "settings__warmup_rounding_equipment",
  increment: "settings__warmup_rounding_increment",
} as const satisfies Record<WarmupRounding, string>;

const sameSteps = (a: readonly WarmupStep[], b: readonly WarmupStep[]) =>
  a.length === b.length && a.every((s, i) => s.percent === b[i]?.percent && s.reps === b[i]?.reps);

/**
 * The warm-up calculator: the ramp built for the first working set, as editable steps (a share of
 * the working weight for some reps) and how each load is rounded. The default is 50% × 5,
 * 70% × 3 and 85% × 1, rounded to the bars and plates.
 */
export function WarmupSettingsScreen() {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const { preferences, setUi } = usePreferences();
  const { warmupSteps: steps, warmupRounding: rounding } = preferences.ui;
  const [picker, setPicker] = useState(false);
  const isDefault = sameSteps(steps, DEFAULT_WARMUP_STEPS) && rounding === "equipment";

  const change = (index: number, patch: Partial<WarmupStep>) =>
    setUi({
      warmupSteps: steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    });
  const add = () => {
    const last = steps.at(-1);
    const percent = Math.min(PERCENT_MAX, (last?.percent ?? 40) + PERCENT_STEP);
    setUi({ warmupSteps: [...steps, { percent, reps: 1 }] });
  };

  return (
    <ScrollPage title={t("settings__warmup_title")} back backFallback="/settings/workouts">
      <Text className="px-1 text-caption text-muted">{t("settings__warmup_hint")}</Text>
      <ListSection title={t("settings__warmup_steps")}>
        {steps.map((step, index) => (
          <View key={index} className="gap-2 px-4 py-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-medium text-body text-foreground">
                {t("settings__warmup_step", { number: index + 1 })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("settings__warmup_remove", { number: index + 1 })}
                disabled={steps.length <= 1}
                hitSlop={8}
                onPress={() => setUi({ warmupSteps: steps.filter((_, i) => i !== index) })}
                style={{ opacity: steps.length <= 1 ? 0.3 : 1 }}
              >
                <Trash size={20} color={subtle} />
              </Pressable>
            </View>
            <View className="flex-row items-center justify-between gap-3">
              <Stepper
                label={t("settings__warmup_percent")}
                valueText={`${step.percent}%`}
                canDecrement={step.percent > PERCENT_MIN}
                canIncrement={step.percent < PERCENT_MAX}
                decrementLabel={t("settings__warmup_percent_less")}
                incrementLabel={t("settings__warmup_percent_more")}
                onStep={(direction) =>
                  change(index, {
                    percent: Math.min(
                      PERCENT_MAX,
                      Math.max(PERCENT_MIN, step.percent + direction * PERCENT_STEP),
                    ),
                  })
                }
              />
              <Stepper
                label={t("settings__warmup_reps")}
                valueText={t("settings__warmup_reps_value", { count: step.reps })}
                canDecrement={step.reps > REPS_MIN}
                canIncrement={step.reps < REPS_MAX}
                decrementLabel={t("settings__warmup_reps_less")}
                incrementLabel={t("settings__warmup_reps_more")}
                onStep={(direction) =>
                  change(index, {
                    reps: Math.min(REPS_MAX, Math.max(REPS_MIN, step.reps + direction)),
                  })
                }
              />
            </View>
          </View>
        ))}
        <ListRow
          icon={Plus}
          title={t("settings__warmup_add")}
          accessory="none"
          disabled={steps.length >= WARMUP_STEPS_MAX}
          onPress={add}
        />
      </ListSection>
      <ListSection title={t("settings__warmup_rounding")}>
        <ListRow
          title={t("settings__warmup_rounding")}
          value={t(ROUNDING_KEYS[rounding])}
          onPress={() => setPicker(true)}
        />
      </ListSection>
      <ListSection>
        <ListRow
          icon={ArrowCounterClockwise}
          title={t("settings__warmup_reset")}
          accessory="none"
          disabled={isDefault}
          onPress={() =>
            setUi({ warmupSteps: [...DEFAULT_WARMUP_STEPS], warmupRounding: "equipment" })
          }
        />
      </ListSection>
      <OptionSheet<WarmupRounding>
        isOpen={picker}
        onOpenChange={setPicker}
        title={t("settings__warmup_rounding")}
        description={t("settings__warmup_rounding_hint")}
        options={WARMUP_ROUNDINGS.map((value) => ({ value, label: t(ROUNDING_KEYS[value]) }))}
        value={rounding}
        onSelect={(value) => setUi({ warmupRounding: value })}
      />
    </ScrollPage>
  );
}
