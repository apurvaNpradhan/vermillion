import { TRAINING_LIMITS } from "@workspace/shared";
import { useState } from "react";
import { Linking, Pressable, Text } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { splitLinks } from "../links";
import { SavedTextField } from "./saved-text-field";

/**
 * The Workout's note: plain text, several lines. At rest it shows the text with links tappable
 * (opened in the browser); tapping anywhere else opens it for editing.
 */
export function WorkoutNote({
  value,
  onText,
}: {
  value: string | null;
  onText: (text: string | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  if (value !== null && !editing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("training__note_label")}: ${value}`}
        accessibilityHint={t("training__note_edit_hint")}
        onPress={() => setEditing(true)}
        className="gap-1.5 rounded-xl bg-field px-3 py-2.5"
      >
        <Text className="text-label font-medium text-foreground">{t("training__note_label")}</Text>
        <Text className="text-body text-foreground">
          {splitLinks(value).map((segment, index) =>
            segment.url === null ? (
              segment.text
            ) : (
              <Text
                key={index}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(segment.url ?? "")}
                className="text-body text-foreground underline"
              >
                {segment.text}
              </Text>
            ),
          )}
        </Text>
      </Pressable>
    );
  }
  return (
    <SavedTextField
      label={t("training__note_label")}
      value={value}
      onText={onText}
      placeholder={t("training__note_placeholder")}
      multiline
      autoFocus={editing}
      onBlur={() => setEditing(false)}
      maxLength={TRAINING_LIMITS.noteMax}
    />
  );
}
