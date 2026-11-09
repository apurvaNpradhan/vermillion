import { rejectionMessageKey } from "@workspace/client/sync-rejection";
import { Alert } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";

import { useRejectedExercises } from "../../use-rejected-exercises";

/**
 * Exercise changes the server refused, named by the exercise's title, with the reason. They stay
 * on this device until discarded; the user makes the change again from the exercise itself.
 */
export function RejectedExercises() {
  const { t } = useTranslation();
  const { rejected, discard } = useRejectedExercises();
  const [discarding, setDiscarding] = useState<string | null>(null);
  if (rejected.length === 0) return null;

  return (
    <View className="gap-3">
      <ConfirmationDialog
        isOpen={discarding !== null}
        onOpenChange={(open) => {
          if (!open) setDiscarding(null);
        }}
        title={t("sync__rejected_discard_title")}
        description={t("sync__rejected_discard_body")}
        cancelLabel={t("common__cancel")}
        confirmLabel={t("sync__rejected_discard_confirm")}
        onConfirm={() => {
          if (discarding !== null) void discard(discarding);
        }}
      />
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t("sync__rejected_title")}</Alert.Title>
          <Alert.Description>{t("exercise__rejected_description")}</Alert.Description>
        </Alert.Content>
      </Alert>
      {rejected.map(({ write, title }) => (
        <Card key={write.id}>
          <Card.Body className="gap-2">
            <View className="gap-1">
              <Text numberOfLines={2} className="font-medium text-body text-foreground">
                {title ?? t("exercise__rejected_unnamed")}
              </Text>
              <Text className="text-caption text-muted">
                {t(write.op === "PUT" ? "exercise__rejected_create" : "exercise__rejected_change")}
              </Text>
              <Text className="text-muted">{t(rejectionMessageKey(write.code))}</Text>
            </View>
            <View className="flex-row gap-2">
              <Button size="sm" variant="danger-soft" onPress={() => setDiscarding(write.id)}>
                <Button.Label>{t("sync__rejected_discard")}</Button.Label>
              </Button>
            </View>
          </Card.Body>
        </Card>
      ))}
    </View>
  );
}
