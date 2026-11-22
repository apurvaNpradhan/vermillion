import { GLOW_ALPHA, PHOTO_SCRIM_ALPHA, type CardPalette } from "@workspace/ui/tokens/share-card";
import type { ReactNode, Ref } from "react";
import { PixelRatio, Platform, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { appConfig } from "@/platform/app-config";
import { SigilMark } from "@/platform/ui/sigil-mark";

import { captureDimensions } from "./capture-dimensions";
import { CARD_HEIGHT, CARD_WIDTH } from "./types";

/** Instagram and other story viewers cover the top and bottom of a 9:16 image with their own UI. */
export const CARD_PADDING_X = 88;
export const CARD_PADDING_TOP = 168;
export const FOOTER_HEIGHT = 168;

/**
 * The fixed 1080 × 1920 frame every Share card is drawn in: the background (flat, with a Classic glow,
 * or a photo under a full-card scrim), the card's content, and a footer with mark A2, the app's wordmark and
 * a slot reserved for the public link, empty until that link exists (ADR 0042). A transparent
 * canvas (a Sticker) has no background and no footer.
 */
export function CardCanvas({
  viewRef,
  palette,
  photo = null,
  transparent = false,
  link = null,
  children,
}: {
  /** The frame itself, which the capture targets. */
  viewRef?: Ref<View>;
  palette: CardPalette;
  /** A full-bleed picture drawn under the scrim, for the Photo background. */
  photo?: ReactNode;
  transparent?: boolean;
  /** The public link, once there is one. */
  link?: string | null;
  children: ReactNode;
}) {
  const target = captureDimensions(Platform.OS, PixelRatio.get());
  return (
    <View
      ref={viewRef}
      collapsable={false}
      style={{ width: target.layoutWidth, height: target.layoutHeight, overflow: "hidden" }}
    >
      <View
        collapsable={false}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          transform: [{ scale: target.designScale }],
          transformOrigin: "top left",
          overflow: "hidden",
          // A photo that has not loaded still leaves a dark card, never a transparent one.
          backgroundColor: transparent
            ? "transparent"
            : (palette.fill ?? palette.scrim ?? "transparent"),
        }}
      >
        {photo ? <View style={{ position: "absolute", inset: 0 }}>{photo}</View> : null}
        {palette.glow ? <Glow color={palette.glow} /> : null}
        {palette.scrim && photo ? <Scrim color={palette.scrim} /> : null}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: transparent ? 0 : FOOTER_HEIGHT,
            paddingHorizontal: CARD_PADDING_X,
            paddingTop: transparent ? 0 : CARD_PADDING_TOP,
          }}
        >
          {children}
        </View>
        {transparent ? null : (
          <View
            style={{
              position: "absolute",
              left: CARD_PADDING_X,
              right: CARD_PADDING_X,
              bottom: 0,
              height: FOOTER_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
              {/* Mark A2: the ink mark with the single ember point. */}
              <SigilMark size={64} color={palette.text} emberColor={palette.record} />
              <Text
                className="font-semibold"
                style={{ fontSize: 36, letterSpacing: 6, color: palette.textSecondary }}
              >
                {appConfig.displayName.toLocaleUpperCase()}
              </Text>
            </View>
            {/* Reserved for the public link; nothing is drawn until the link exists. */}
            <View style={{ minWidth: 320, alignItems: "flex-end" }}>
              {link ? (
                <Text className="font-medium" style={{ fontSize: 32, color: palette.textMuted }}>
                  {link}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function Glow({ color }: { color: string }) {
  return (
    <Svg
      width={CARD_WIDTH}
      height={CARD_HEIGHT * 0.6}
      style={{ position: "absolute", top: 0, left: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="0%" rx="95%" ry="80%" fx="50%" fy="0%">
          <Stop offset="0" stopColor={color} stopOpacity={GLOW_ALPHA} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  );
}

function Scrim({ color }: { color: string }) {
  return (
    <Svg
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      style={{ position: "absolute", top: 0, left: 0 }}
      pointerEvents="none"
    >
      {/* A uniform scrim protects headings at y=168, rows, stats and footer alike. */}
      <Rect x={0} y={0} width="100%" height="100%" fill={color} opacity={PHOTO_SCRIM_ALPHA} />
    </Svg>
  );
}
