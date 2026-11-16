import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { formatCalendarDate } from "./local-date";
import { poseLabels } from "./pose-labels";
import { PrivatePhoto } from "./privacy/private-photo";
import { useReveal } from "./privacy/use-reveal";
import { useHidePhotos } from "./privacy/use-hide-photos";
import { useLatestProgressPhoto } from "./use-progress-photos";

/**
 * The first tile of the Measurements page (ADR 0041): the latest progress photo and its date,
 * blurred while Hide photos is on until it is tapped; a second tap opens the gallery. With no
 * photo yet it says where they come from.
 */
export function PhotoFirstTile() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const latest = useLatestProgressPhoto();
  const hide = useHidePhotos();
  const reveal = useReveal(hide.hidden);
  const photo = latest.photo;
  if (!photo) {
    return (
      <View className="w-1/2 gap-2 py-6">
        <Text className="text-body text-muted">{t("body__photo_slot")}</Text>
        <Text className="text-caption text-muted">
          {latest.loading ? t("common__loading") : t("body__photo_later")}
        </Text>
      </View>
    );
  }
  const date = formatCalendarDate(photo.local_date, i18n.language);
  const hidden = reveal.hidden(photo.id);
  return (
    <View className="w-1/2 gap-2 p-3">
      <PrivatePhoto
        mediaId={photo.media_id}
        width={120}
        height={160}
        hidden={hidden}
        label={t("body__photo_first_tile", { date })}
        hiddenLabel={t("body__photo_hidden")}
        onPress={() => (hidden ? reveal.reveal(photo.id) : router.push("/body/photos"))}
      />
      <Text className="text-caption text-muted">
        {t("body__photo_tile", { pose: t(poseLabels[photo.pose]), date })}
      </Text>
    </View>
  );
}
