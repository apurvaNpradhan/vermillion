import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

/**
 * A quiet inline note that teaches one thing once: a line of text and a "Got it" text button. No
 * border; it sits on the field surface. Announced as a note; the button is a 44pt target.
 */
export function Hint({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="gap-1 rounded-xl bg-field px-3 pt-3">
      <Text
        accessible
        role="note"
        accessibilityLabel={t("hint__note_label", { text })}
        className="font-normal text-body text-foreground"
      >
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("hint__got_it")}
        onPress={onDismiss}
        className="min-h-11 min-w-11 items-end justify-center self-end px-2 active:opacity-60"
      >
        <Text className="font-medium text-label text-accent-text">{t("hint__got_it")}</Text>
      </Pressable>
    </View>
  );
}
