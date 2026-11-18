import { type MediaVariant } from "@workspace/shared";
import { Image } from "expo-image";
import { CloudArrowUp, WarningCircle } from "phosphor-react-native";
import { useThemeColor } from "heroui-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Skeleton } from "@/platform/ui/skeleton";
import { useTranslation } from "@/platform/i18n";

import { useMediaImage } from "./use-media-image";

const BADGE = 18;

/**
 * An image of a media (ADR 0040) that is honest about the file lagging the row: the local file
 * as soon as there is one, a placeholder while it downloads (the thumbnail stands in for a full
 * image), a quiet badge while it uploads, and a badge that retries when a transfer failed.
 * `fallback` shows when there is no picture to draw (no media, or the file has not arrived).
 */
export function MediaImage({
  mediaId,
  variant = "thumb",
  size,
  height = size,
  blurRadius = 0,
  fallback = null,
  rounded = "rounded-xl",
  onSettled,
  localOnly = false,
}: {
  mediaId: string | null;
  /** Read only existing device files; never request transfers or show transfer controls. */
  localOnly?: boolean;
  variant?: MediaVariant;
  /** Width in dp; the view is square unless `height` says otherwise. */
  size: number;
  /** Height in dp, for a portrait or landscape tile. */
  height?: number;
  /**
   * Blurs the picture itself (not a layer over it), for private photos kept hidden until tapped.
   * Strong enough that the picture cannot be made out.
   */
  blurRadius?: number;
  fallback?: ReactNode;
  /** Radius class; the view clips its image to it. */
  rounded?: string;
  /**
   * Called once the picture has loaded or failed, or at once when there is nothing to load (a
   * placeholder shows). A file still downloading does not settle it. Share cards wait on this.
   */
  onSettled?: () => void;
}) {
  const { t } = useTranslation();
  const file = useMediaImage(mediaId, variant, localOnly);
  // The thumbnail is what a full image shows while it downloads.
  const thumb = useMediaImage(variant === "full" ? mediaId : null, "thumb", localOnly);
  const danger = useThemeColor("danger");
  const foreground = useThemeColor("foreground");
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const uri = file.uri ?? thumb.uri;
  const drawable = uri !== null && failedUri !== uri;
  const nothingToLoad = !drawable && file.state !== "downloading" && thumb.state !== "downloading";
  useEffect(() => {
    if (nothingToLoad) onSettled?.();
  }, [nothingToLoad, onSettled]);

  return (
    <View className={`overflow-hidden bg-default ${rounded}`} style={{ width: size, height }}>
      {drawable ? (
        <Image
          source={{ uri }}
          recyclingKey={uri}
          contentFit="cover"
          blurRadius={blurRadius}
          transition={localOnly ? 0 : 120}
          onLoad={onSettled}
          onError={() => {
            setFailedUri(uri);
            onSettled?.();
          }}
          style={{ width: size, height }}
        />
      ) : (
        fallback
      )}
      {file.state === "downloading" && !drawable ? (
        <View className="absolute inset-0" pointerEvents="none">
          {/* A wait on the network: the one place a placeholder is right. */}
          <Skeleton label={t("media__downloading")} className="h-full w-full rounded-none" />
        </View>
      ) : null}
      {file.state === "uploading" ? (
        <View
          accessible
          accessibilityLabel={t("media__uploading")}
          pointerEvents="none"
          className="absolute bottom-1 right-1 items-center justify-center rounded-full bg-background/80"
          style={{ width: BADGE, height: BADGE }}
        >
          <CloudArrowUp size={20} color={foreground} />
        </View>
      ) : null}
      {file.state === "failed" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("media__failed_label")}
          hitSlop={8}
          onPress={file.retry}
          className="absolute bottom-1 right-1 items-center justify-center rounded-full bg-background/80"
          style={{ width: BADGE, height: BADGE }}
        >
          <WarningCircle size={20} color={danger} />
        </Pressable>
      ) : null}
    </View>
  );
}
