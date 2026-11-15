import { ScrollView, Text, View, Pressable } from "react-native";
import { MediaImage } from "@/media";
import { Button } from "@/platform/ui/button";
import { useTranslation } from "@/platform/i18n";
import { useSessionPhotos } from "../use-session-photos";
/** The shared full-screen viewer connects through onOpenPhoto in the consuming screen. */
export function SessionPhotos({
  sessionId,
  onOpenPhoto,
  readOnly = false,
}: {
  sessionId: string;
  onOpenPhoto?: (index: number) => void;
  readOnly?: boolean;
}) {
  const state = useSessionPhotos(sessionId);
  const { t } = useTranslation();
  if (state.failed)
    return (
      <Button onPress={state.retry}>
        <Button.Label>{t("training__retry")}</Button.Label>
      </Button>
    );
  if (state.loading) return <Text className="text-caption text-muted">{t("common__loading")}</Text>;
  return (
    <View className="gap-2">
      {state.photos.length ? (
        <Text className="text-caption text-muted">
          {t("media__photo_count", { count: state.photos.length })}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {state.photos.map((photo, index) => (
          <View key={photo.id} className="mr-2 gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("media__open_photo", { index: index + 1 })}
              disabled={!onOpenPhoto}
              onPress={() => onOpenPhoto?.(index)}
            >
              <MediaImage mediaId={photo.media_id} size={readOnly ? 40 : 112} />
            </Pressable>
            {!readOnly ? (
              <Button variant="danger-soft" onPress={() => void state.remove(photo.id)}>
                <Button.Label>{t("media__remove")}</Button.Label>
              </Button>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {!readOnly && state.photos.length < 4 ? (
        <View className="flex-row gap-2">
          <Button variant="secondary" isDisabled={state.busy} onPress={() => void state.pick()}>
            <Button.Label>{t("media__add_photos")}</Button.Label>
          </Button>
          <Button variant="secondary" isDisabled={state.busy} onPress={() => void state.pick(true)}>
            <Button.Label>{t("media__camera")}</Button.Label>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
