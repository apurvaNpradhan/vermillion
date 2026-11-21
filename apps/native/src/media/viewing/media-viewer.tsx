import { Image } from "expo-image";
import { Spinner, useThemeColor } from "heroui-native";
import { WarningCircle } from "phosphor-react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ImageViewer, type ViewerImageBox, type ViewerItem } from "@/platform/ui/image-viewer";

import { useMediaImage } from "./use-media-image";
import { useMediaSizes } from "./use-media-sizes";

/** One picture of the viewer: the full image, with the thumbnail standing in while it downloads. */
function FullMediaImage({
  mediaId,
  box,
  localOnly,
}: {
  mediaId: string;
  box: ViewerImageBox;
  localOnly: boolean;
}) {
  const { t } = useTranslation();
  const full = useMediaImage(mediaId, "full", localOnly);
  const thumb = useMediaImage(mediaId, "thumb", localOnly);
  const danger = useThemeColor("danger");
  const uri = full.uri ?? thumb.uri;
  return (
    <View style={{ width: box.width, height: box.height }}>
      {uri !== null ? (
        <Image
          source={{ uri }}
          recyclingKey={uri}
          contentFit="contain"
          transition={120}
          style={{ width: box.width, height: box.height }}
        />
      ) : null}
      {localOnly && uri === null && full.state === "missing" && thumb.state === "missing" ? (
        // Nothing is fetched here: a calm note instead of a spinner that would never finish.
        <View
          accessible
          accessibilityLabel={t("media__not_on_device")}
          className="absolute inset-0 items-center justify-center px-6"
        >
          <Text className="font-normal text-center text-body text-muted">
            {t("media__not_on_device")}
          </Text>
        </View>
      ) : null}
      {full.uri === null && full.state === "downloading" ? (
        <View
          accessible
          accessibilityLabel={t("media__downloading")}
          className="absolute inset-0 items-center justify-center"
          pointerEvents="none"
        >
          <Spinner size="sm" />
        </View>
      ) : null}
      {full.state === "failed" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("media__failed_label")}
          hitSlop={8}
          onPress={full.retry}
          className="absolute inset-0 items-center justify-center"
        >
          <WarningCircle size={24} color={danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Full-screen viewer over media ids (ADR 0040): pinch to zoom, swipe between the ids, drag down to
 * close. Each page shows its thumbnail at once and swaps in the full variant when this device has
 * it (the page asks for it on demand, and it is cached with a size cap). `captions` are optional
 * and parallel to `mediaIds`. Generic on purpose: progress photos use it now, Session photos next.
 */
export function MediaViewer({
  mediaIds,
  captions,
  index,
  onIndexChange,
  onClose,
  localOnly = false,
}: {
  /** Show only files already on this device; never request a download or a retry. */
  localOnly?: boolean;
  mediaIds: readonly string[];
  captions?: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sizes = useMediaSizes(mediaIds);
  const items = useMemo<ViewerItem[]>(
    () =>
      mediaIds.map((id, at) => ({
        key: id,
        width: sizes.get(id)?.width ?? 0,
        height: sizes.get(id)?.height ?? 0,
        ...(captions?.[at] ? { caption: captions[at] } : {}),
      })),
    [mediaIds, captions, sizes],
  );
  return (
    <ImageViewer
      items={items}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      closeLabel={t("common__close")}
      pageLabel={(page, count) => t("media__page", { page: page + 1, count })}
      renderImage={(item, box) => (
        <FullMediaImage mediaId={item.key} box={box} localOnly={localOnly} />
      )}
    />
  );
}
