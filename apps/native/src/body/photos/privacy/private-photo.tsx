import { useThemeColor } from "heroui-native";
import { EyeSlash } from "phosphor-react-native";
import { Pressable, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { MediaImage } from "@/media";

/** Blur radius of a hidden thumbnail: the picture itself is blurred, so it cannot be made out. */
export const HIDDEN_BLUR_RADIUS = 45;

/**
 * A progress photo's thumbnail (ADR 0041). While `hidden` (Hide photos is on and the reader has
 * not tapped it) the picture is blurred and a tap reveals it instead of opening it; once shown, a
 * tap opens it. `width` and `height` are the tile in dp. The blur is on the image's own pixels
 * (expo-image's `blurRadius`), which is real on both platforms, rather than a layer over it.
 */
export function PrivatePhoto({
  mediaId,
  width,
  height,
  hidden,
  label,
  hiddenLabel,
  onPress,
  onLongPress,
  rounded = "rounded-xl",
}: {
  mediaId: string;
  width: number;
  height: number;
  hidden: boolean;
  /** Names the photo (pose and date) for screen readers. */
  label: string;
  /** Replaces the label while the photo is hidden ("Photo hidden, tap to show"). */
  hiddenLabel: string;
  /** Called on a press; the screen reveals a hidden photo first and opens a shown one. */
  onPress: () => void;
  onLongPress?: () => void;
  rounded?: string;
}) {
  const { t } = useTranslation();
  const muted = useThemeColor("muted");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hidden ? hiddenLabel : label}
      accessibilityHint={hidden ? undefined : t("body__photo_open")}
      onPress={onPress}
      onLongPress={onLongPress}
      className={`overflow-hidden ${rounded}`}
      style={{ width, height }}
    >
      <MediaImage
        mediaId={mediaId}
        size={width}
        height={height}
        rounded={rounded}
        blurRadius={hidden ? HIDDEN_BLUR_RADIUS : 0}
      />
      {hidden ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center bg-background/40"
        >
          <EyeSlash size={24} color={muted} />
        </View>
      ) : null}
    </Pressable>
  );
}
