import { Button, Input, Label, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";

type Values = { title: string; body: string };

/** Title and body fields with save/cancel; used to create and to edit. */
export function NoteForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Values;
  submitLabel: string;
  onSubmit: (values: Values) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), body });
      if (!onCancel) {
        setTitle("");
        setBody("");
      }
    } catch {
      // The global handler reports the error; keep the text for another try.
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3">
      <TextField>
        <Label>{t("notes__field_title")}</Label>
        <Input value={title} onChangeText={setTitle} maxLength={200} />
      </TextField>
      <TextField>
        <Label>{t("notes__field_body")}</Label>
        <Input value={body} onChangeText={setBody} maxLength={10_000} multiline />
      </TextField>
      <View className="flex-row gap-2">
        <Button isDisabled={saving || title.trim() === ""} onPress={() => void submit()}>
          {saving ? <Spinner size="sm" /> : null}
          <Button.Label>{submitLabel}</Button.Label>
        </Button>
        {onCancel ? (
          <Button variant="secondary" onPress={onCancel}>
            <Button.Label>{t("common__cancel")}</Button.Label>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
