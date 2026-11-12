import { Image } from "expo-image";
import { memo, useState } from "react";
import { Text, View } from "react-native";

import { appConfig } from "@/platform/app-config";

import { thumbnailUrl } from "../../media-url";

export const THUMBNAIL_SIZE = 40;

/**
 * An exercise's round thumbnail, cached on disk. Missing or failed media shows a neutral initial.
 */
export const ExerciseThumbnail = memo(function ExerciseThumbnail({
  thumbnailKey,
  title,
  size = THUMBNAIL_SIZE,
}: {
  thumbnailKey: string | null;
  title?: string;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uri = thumbnailUrl(appConfig.urls.exerciseMedia, thumbnailKey);
  if (uri === null || failedUrl === uri)
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="items-center justify-center rounded-full bg-default"
        style={{ width: size, height: size }}
      >
        <Text className="font-medium text-label text-muted">
          {title?.trim().slice(0, 1).toLocaleUpperCase() || "·"}
        </Text>
      </View>
    );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-full bg-default"
      style={{ width: size, height: size }}
    >
      <Image
        source={{ uri }}
        cachePolicy="disk"
        recyclingKey={uri}
        contentFit="cover"
        transition={120}
        onError={() => setFailedUrl(uri)}
        style={{ width: size, height: size }}
      />
    </View>
  );
});
