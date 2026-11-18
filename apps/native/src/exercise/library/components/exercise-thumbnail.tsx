import { MediaImage } from "@/media";
import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { appConfig } from "@/platform/app-config";

import { useCachedThumbnail } from "../../use-cached-thumbnail";
import { thumbnailUrl } from "../../media-url";

export const THUMBNAIL_SIZE = 40;

/**
 * An exercise's round thumbnail, cached on disk. Missing or failed media shows a neutral initial.
 */
export const ExerciseThumbnail = memo(function ExerciseThumbnail({
  thumbnailKey,
  imageMediaId,
  title,
  size = THUMBNAIL_SIZE,
  plate,
  onSettled,
  localOnly = false,
}: {
  thumbnailKey: string | null;
  /** Share cards only draw local media and existing catalog cache entries. */
  localOnly?: boolean;
  imageMediaId?: string | null;
  title?: string;
  size?: number;
  /** Colours of the letter avatar, for a surface that is not the app's own (a Share card). */
  plate?: { background: string; ink: string };
  /** Called once the picture has loaded or failed, or at once when the avatar shows instead. */
  onSettled?: () => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const mediaId = imageMediaId;
  const remoteUri = thumbnailUrl(appConfig.urls.exerciseMedia, thumbnailKey);
  const cached = useCachedThumbnail(remoteUri, localOnly && !mediaId);
  const uri = localOnly ? cached.uri : remoteUri;
  const initial = title?.trim().slice(0, 1).toLocaleUpperCase() ?? "";
  const avatar = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={
        plate
          ? "items-center justify-center rounded-full"
          : "items-center justify-center rounded-full bg-default"
      }
      style={{ width: size, height: size, backgroundColor: plate?.background }}
    >
      {initial ? (
        <Text
          className={plate ? "font-medium" : "font-medium text-label text-muted"}
          style={plate ? { color: plate.ink, fontSize: size * 0.42 } : undefined}
        >
          {initial}
        </Text>
      ) : (
        <View
          className="size-1.5 rounded-full bg-muted"
          style={plate ? { backgroundColor: plate.ink } : undefined}
        />
      )}
    </View>
  );
  const showsAvatar = !mediaId && (uri === null || failedUrl === uri);
  useEffect(() => {
    if (showsAvatar && !cached.loading) onSettled?.();
  }, [showsAvatar, cached.loading, onSettled]);
  if (mediaId)
    return (
      <MediaImage
        mediaId={mediaId}
        localOnly={localOnly}
        size={size}
        rounded="rounded-full"
        fallback={plate ? avatar : null}
        onSettled={onSettled}
      />
    );
  if (showsAvatar || uri === null) return avatar;
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
        transition={localOnly ? 0 : 120}
        onLoad={onSettled}
        onError={() => {
          setFailedUrl(uri);
          onSettled?.();
        }}
        style={{ width: size, height: size }}
      />
    </View>
  );
});
