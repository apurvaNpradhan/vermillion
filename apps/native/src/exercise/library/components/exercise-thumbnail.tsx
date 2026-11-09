import type { MuscleGroup } from "@workspace/shared";
import { Image } from "expo-image";
import { memo, useState } from "react";
import { View } from "react-native";

import { appConfig } from "@/platform/app-config";

import { thumbnailUrl } from "../../media-url";
import { MuscleIcon } from "./muscle-icon";

export const THUMBNAIL_SIZE = 56;

/**
 * An exercise's square thumbnail from the media bucket, cached on disk. A missing key, a failed
 * load or an offline device shows the muscle group's tile instead.
 */
export const ExerciseThumbnail = memo(function ExerciseThumbnail({
  thumbnailKey,
  muscle,
  size = THUMBNAIL_SIZE,
}: {
  thumbnailKey: string | null;
  muscle: MuscleGroup;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uri = thumbnailUrl(appConfig.urls.exerciseMedia, thumbnailKey);
  if (uri === null || failedUrl === uri) return <MuscleIcon muscle={muscle} size={size} />;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-lg bg-default"
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
