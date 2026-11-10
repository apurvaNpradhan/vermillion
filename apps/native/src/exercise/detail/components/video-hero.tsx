import type { MuscleGroup } from "@workspace/shared";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useIsFocused } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useThemeColor } from "heroui-native";
import { Play } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTranslation } from "@/platform/i18n";
import { MuscleIcon } from "../../library/components/muscle-icon";

/**
 * The picture at the top of the detail screen: the demonstration video, muted and looping, playing
 * while the screen is focused, over the thumbnail as its poster. Offline or on an error it stays
 * on the thumbnail, and with neither it shows the muscle's icon. Tapping pauses and plays; under
 * Reduce Motion the video starts paused.
 */
export function VideoHero({
  title,
  muscle,
  videoUri,
  posterUri,
  width,
  height,
}: {
  title: string;
  muscle: MuscleGroup;
  videoUri: string | null;
  posterUri: string | null;
  width: number;
  height: number;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const [paused, setPaused] = useState(reduced);
  const [firstFrame, setFirstFrame] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const foreground = useThemeColor("foreground");
  const background = useThemeColor("background");
  // The pictures are mostly white: the status bar and the back button need a shade under them.
  const scrim = useSafeAreaInsets().top + 72;

  const player = useVideoPlayer(videoUri, (instance) => {
    instance.muted = true;
    instance.loop = true;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const failed = videoUri === null || status === "error";

  useEffect(() => {
    if (videoUri === null) return;
    if (focused && !paused) player.play();
    else player.pause();
  }, [player, videoUri, focused, paused]);

  const showVideo = !failed;
  const hasPoster = posterUri !== null && !posterFailed;
  const showPoster = hasPoster && (failed || !firstFrame);
  const showPlaceholder = !hasPoster && (failed || !firstFrame);

  return (
    <Pressable
      accessibilityRole={showVideo ? "button" : "image"}
      accessibilityLabel={
        showVideo
          ? `${t("exercise__video_label", { title })}. ${t(paused ? "exercise__video_play" : "exercise__video_pause")}`
          : title
      }
      disabled={!showVideo}
      onPress={() => setPaused((current) => !current)}
      className="bg-default"
      style={{ width, height }}
    >
      {showPlaceholder ? (
        <View className="flex-1 items-center justify-center">
          <MuscleIcon muscle={muscle} size={96} />
        </View>
      ) : null}
      {showVideo ? (
        <VideoView
          player={player}
          nativeControls={false}
          contentFit="cover"
          surfaceType="textureView"
          allowsPictureInPicture={false}
          onFirstFrameRender={() => setFirstFrame(true)}
          style={{ position: "absolute", width, height }}
        />
      ) : null}
      {showPoster ? (
        <Image
          source={{ uri: posterUri }}
          cachePolicy="disk"
          contentFit="cover"
          transition={150}
          onError={() => setPosterFailed(true)}
          style={{ position: "absolute", width, height }}
        />
      ) : null}
      <Svg
        pointerEvents="none"
        width={width}
        height={scrim}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Defs>
          <LinearGradient id="hero-top-scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={background} stopOpacity={0.75} />
            <Stop offset="1" stopColor={background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={scrim} fill="url(#hero-top-scrim)" />
      </Svg>
      {showVideo && paused ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
          accessibilityElementsHidden
        >
          <View className="size-14 items-center justify-center rounded-full bg-overlay/80">
            <Play size={24} weight="fill" color={foreground} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
