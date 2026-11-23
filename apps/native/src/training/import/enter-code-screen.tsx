import { SHARE_CODE_LENGTH, parseShareInput } from "@workspace/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { ScrollPage } from "@/platform/ui/page";

/** "Enter code": a six-character code, or a whole pasted link, opens the import preview. */
export function EnterCodeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [text, setText] = useState("");
  const code = parseShareInput(text);
  const open = () => {
    if (code) router.replace({ pathname: "/import/[code]", params: { code } });
  };
  return (
    <ScrollPage title={t("share__enter_code_title")} back>
      <Text className="font-normal text-body text-muted">{t("share__enter_code_hint")}</Text>
      <Field
        label={t("share__enter_code_label")}
        value={text}
        onChangeText={setText}
        placeholder={t("share__enter_code_placeholder", { length: SHARE_CODE_LENGTH })}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={200}
        returnKeyType="go"
        onSubmitEditing={open}
        error={text.trim() !== "" && !code ? t("share__enter_code_invalid") : undefined}
      />
      <Button variant="primary" isDisabled={!code} onPress={open}>
        <Button.Label>{t("share__enter_code_continue")}</Button.Label>
      </Button>
    </ScrollPage>
  );
}
