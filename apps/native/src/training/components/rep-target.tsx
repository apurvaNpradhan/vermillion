import type { PlannedSet } from "@workspace/shared";
import { useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";

import { parseRepTarget } from "../reps";
import type { Target } from "../set-editing";
import { TargetPickerSheet } from "./target-picker-sheet";

export function RepTarget({
  set,
  label,
  onChange,
}: {
  set: PlannedSet;
  label: string;
  onChange: (change: Partial<Target>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const value =
    set.reps_min === undefined
      ? "–"
      : set.reps_min === set.reps_max
        ? String(set.reps_min)
        : `${set.reps_min}–${set.reps_max}`;
  const parsed = parseRepTarget(min, max, range);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t("training__rep_target_hint")}
        onPress={() => {
          Keyboard.dismiss();
          setMin(set.reps_min === undefined ? "" : String(set.reps_min));
          setMax(set.reps_max === undefined ? "" : String(set.reps_max));
          setRange(set.reps_min !== set.reps_max);
          setOpen(true);
        }}
        className="h-11 flex-1 flex-row items-center justify-center gap-1 rounded-lg bg-default px-1"
      >
        <Text className="text-body text-foreground tabular-nums">{value}</Text>
      </Pressable>
      <TargetPickerSheet
        isOpen={open}
        onOpenChange={setOpen}
        title={t("training__rep_target")}
        description={t("training__rep_target_hint")}
        disabled={parsed === null}
        onDone={() => {
          if (parsed) {
            onChange(parsed);
            setOpen(false);
          }
        }}
      >
        <View
          className="flex-row gap-2"
          accessibilityRole="radiogroup"
          accessibilityLabel={t("training__rep_target")}
        >
          {[false, true].map((choice) => (
            <Button
              key={String(choice)}
              className={`flex-1 ${range === choice ? "border-foreground bg-default" : ""}`}
              variant="secondary"
              accessibilityRole="radio"
              accessibilityState={{ checked: range === choice }}
              onPress={() => {
                setRange(choice);
                if (choice && max === "") setMax(min);
              }}
            >
              <Button.Label>
                {t(choice ? "training__rep_range" : "training__exact_reps")}
              </Button.Label>
            </Button>
          ))}
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field
              label={t(range ? "training__reps_min" : "training__field_reps")}
              value={min}
              onChangeText={setMin}
              keyboardType="number-pad"
              selectTextOnFocus
              maxLength={3}
            />
          </View>
          {range ? (
            <View className="flex-1">
              <Field
                label={t("training__reps_max")}
                value={max}
                onChangeText={setMax}
                keyboardType="number-pad"
                selectTextOnFocus
                maxLength={3}
              />
            </View>
          ) : null}
        </View>
        {parsed === null ? (
          <Text accessibilityRole="alert" className="text-caption text-danger">
            {t("training__rep_target_invalid")}
          </Text>
        ) : null}
      </TargetPickerSheet>
    </>
  );
}
