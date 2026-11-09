import { EXERCISE_TYPE_KEYS, type ExerciseType } from "@workspace/shared";
import { CaretDown, Lock } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { OptionSheet } from "@/platform/ui/option-sheet";

import { MORE_TYPES, PLAIN_TYPE_CHOICES, typeChoice, type TypeChoice } from "../type-choices";

/**
 * "How you log it": four plain choices and "More" (a sheet of the other five types). When the
 * type is locked (a logged set uses the exercise) the choices are shown but cannot be changed,
 * with the reason beneath.
 */
export function TypePicker({
  value,
  locked,
  onChange,
}: {
  value: ExerciseType;
  locked: boolean;
  onChange: (type: ExerciseType) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = typeChoice(value);

  const choices: { key: TypeChoice; label: string; onPress: () => void }[] = [
    ...PLAIN_TYPE_CHOICES.map((choice) => ({
      key: choice.type,
      label: t(choice.labelKey),
      onPress: () => onChange(choice.type),
    })),
    {
      key: "more",
      label: current === "more" ? t(EXERCISE_TYPE_KEYS[value]) : t("exercise__choice_more"),
      onPress: () => setMoreOpen(true),
    },
  ];

  return (
    <View className="gap-2">
      <View className="gap-2" accessibilityRole="radiogroup">
        {choices.map((choice) => {
          const selected = choice.key === current;
          return (
            <Pressable
              key={choice.key}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: locked }}
              accessibilityLabel={choice.label}
              disabled={locked}
              onPress={choice.onPress}
              className={`h-12 flex-row items-center justify-between rounded-xl border px-4 ${
                selected ? "border-identity bg-identity-soft" : "border-border bg-surface"
              } ${locked && !selected ? "opacity-50" : ""}`}
            >
              <Text
                className={`text-body ${selected ? "font-medium text-foreground" : "text-muted"}`}
              >
                {choice.label}
              </Text>
              {choice.key === "more" ? <CaretDown size={16} color={subtle} /> : null}
            </Pressable>
          );
        })}
      </View>
      {locked ? (
        <View className="flex-row items-start gap-2" accessibilityRole="alert">
          <Lock size={14} color={subtle} weight="fill" />
          <Text className="flex-1 text-caption text-muted">{t("exercise__type_locked")}</Text>
        </View>
      ) : null}
      <OptionSheet<ExerciseType>
        isOpen={moreOpen}
        onOpenChange={setMoreOpen}
        title={t("exercise__choice_more_title")}
        options={MORE_TYPES.map((type) => ({ value: type, label: t(EXERCISE_TYPE_KEYS[type]) }))}
        value={value}
        onSelect={onChange}
      />
    </View>
  );
}
