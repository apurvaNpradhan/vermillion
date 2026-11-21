import { useThemeColor } from "heroui-native";
import { Check } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";

type Choice<T extends string> = { value: T; label: string; hint?: string };

/**
 * One question, a few answers: each a full-width tile with the chosen one on `bg-default` and a
 * check. Nothing is chosen until a tile is pressed, so skipping stores nothing.
 */
export function ChoiceList<T extends string>({
  choices,
  value,
  onChange,
  accessibilityLabel,
}: {
  choices: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const identity = useThemeColor("accent");
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} className="gap-2">
      {choices.map((choice) => {
        const chosen = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            accessibilityLabel={choice.label}
            accessibilityHint={choice.hint}
            onPress={() => {
              if (chosen) return;
              haptic.tick();
              onChange(choice.value);
            }}
            className={`flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-70 ${
              chosen ? "bg-default" : "bg-surface"
            }`}
          >
            <View className="flex-1 gap-0.5">
              <Text className="text-body font-semibold text-foreground">{choice.label}</Text>
              {choice.hint ? <Text className="text-caption text-muted">{choice.hint}</Text> : null}
            </View>
            {chosen ? <Check size={20} weight="bold" color={identity} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
