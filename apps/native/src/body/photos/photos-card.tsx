import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { daysSince } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { usePreferences } from "@/preferences";

import { formatCalendarDate, localDateIn } from "./local-date";
import { poseLabels } from "./pose-labels";
import { PrivatePhoto } from "./private-photo";
import { useReveal } from "./use-reveal";
import { useHidePhotos } from "./use-hide-photos";
import { useLatestProgressPhoto } from "./use-progress-photos";

const THUMB = { width: 72, height: 96 } as const;

/**
 * The Home card for progress photos (ADR 0041): the latest photo as a thumbnail (blurred while
 * Hide photos is on, until tapped) and how long it has been. Everything else opens the gallery.
 */
export function PhotosCard() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const latest = useLatestProgressPhoto();
  const hide = useHidePhotos();
  const { preferences } = usePreferences();
  const reveal = useReveal(hide.hidden);
  const zone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const open = () => router.push("/body/photos");
  const photo = latest.photo;
  const since = photo ? daysSince(photo.local_date, localDateIn(zone)) : null;

  return (
    <View className="gap-3 border-b border-separator pb-5">
      <Pressable accessibilityRole="button" onPress={open} className="gap-1">
        <Text className="text-title-md font-semibold text-foreground">{t("body__photos")}</Text>
      </Pressable>
      {latest.failed ? (
        <Button variant="tertiary" onPress={latest.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : latest.loading ? (
        <Text className="text-body text-muted">{t("common__loading")}</Text>
      ) : photo ? (
        <View className="flex-row items-center gap-4">
          <PrivatePhoto
            mediaId={photo.media_id}
            width={THUMB.width}
            height={THUMB.height}
            hidden={reveal.hidden(photo.id)}
            label={t("body__photo_tile", {
              pose: t(poseLabels[photo.pose]),
              date: formatCalendarDate(photo.local_date, i18n.language),
            })}
            hiddenLabel={t("body__photo_hidden")}
            onPress={() => (reveal.hidden(photo.id) ? reveal.reveal(photo.id) : open())}
          />
          <Pressable accessibilityRole="button" onPress={open} className="flex-1">
            <Text className="text-body text-muted">
              {since === 0
                ? t("body__photos_since_zero")
                : t("body__photos_since", { count: since ?? 0 })}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={open}>
          <Text className="text-body text-muted">{t("body__photos_none_yet")}</Text>
        </Pressable>
      )}
    </View>
  );
}
