import { BottomSheet, Switch } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { sendFeedback } from "@/platform/crash-reporting";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { useAppToast } from "@/platform/ui/use-app-toast";

/**
 * The feedback form as a bottom sheet: a message and an "include my email" switch, off by
 * default. Sending goes through Sentry's feedback API, which adds the device and app version.
 */
export function FeedbackSheet({
  isOpen,
  onOpenChange,
  email,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account's email, offered only through the switch; null when it is not known. */
  email: string | null;
}) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const [message, setMessage] = useState("");
  const [includeEmail, setIncludeEmail] = useState(false);
  const canSend = message.trim().length > 0;

  const close = (open: boolean) => {
    if (!open) {
      setMessage("");
      setIncludeEmail(false);
    }
    onOpenChange(open);
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={close}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent
          footer={
            <>
              <Button
                variant="primary"
                isDisabled={!canSend}
                onPress={() => {
                  sendFeedback(message.trim(), includeEmail ? email : null);
                  toast.show({ variant: "success", label: t("settings__feedback_sent") });
                  close(false);
                }}
              >
                <Button.Label>{t("settings__feedback_send")}</Button.Label>
              </Button>
              <Button variant="secondary" onPress={() => close(false)}>
                <Button.Label>{t("common__cancel")}</Button.Label>
              </Button>
            </>
          }
        >
          <View className="gap-1">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("settings__feedback_title")}
            </BottomSheet.Title>
            <BottomSheet.Description className="text-body text-muted">
              {t("settings__feedback_hint")}
            </BottomSheet.Description>
          </View>
          <Field
            label={t("settings__feedback_message")}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={5}
            maxLength={2000}
            textAlignVertical="top"
          />
          {email ? (
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-body text-foreground">
                {t("settings__feedback_include_email")}
              </Text>
              <Switch
                accessibilityLabel={t("settings__feedback_include_email")}
                isSelected={includeEmail}
                onSelectedChange={setIncludeEmail}
              />
            </View>
          ) : null}
        </ScrollableSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
