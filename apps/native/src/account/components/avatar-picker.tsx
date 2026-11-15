import { Text, View } from "react-native";
import { MediaImage } from "@/media";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { useAvatar } from "../use-avatar";
export function AvatarPicker() {
  const avatar = useAvatar();
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-3">
      <MediaImage mediaId={avatar.id} size={64} rounded="rounded-full" />
      <Button variant="secondary" isDisabled={avatar.busy} onPress={() => void avatar.pick()}>
        <Button.Label>{t("media__avatar")}</Button.Label>
      </Button>
      {avatar.id ? (
        <Button variant="danger-soft" isDisabled={avatar.busy} onPress={() => void avatar.remove()}>
          <Button.Label>{t("media__remove")}</Button.Label>
        </Button>
      ) : null}
      {avatar.busy ? <Text className="text-caption text-muted">{t("common__loading")}</Text> : null}
    </View>
  );
}
