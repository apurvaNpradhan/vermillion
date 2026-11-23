import { PHOTO_SCRIM_ALPHA, type CardPalette } from "@workspace/ui/tokens/share-card";
import type { ReactNode, Ref } from "react";
import { PixelRatio, Platform, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { appConfig } from "@/platform/app-config";
import { SigilMark } from "@/platform/ui/sigil-mark";

import { displayLink, spacedCode } from "./links/link-display";
import { captureDimensions } from "./capture-dimensions";
import { CARD_HEIGHT, CARD_WIDTH } from "./types";

/** Instagram and other story viewers cover the top and bottom of a 9:16 image with their own UI. */
export const CARD_PADDING_X = 88;
export const CARD_PADDING_TOP = 168;
export const FOOTER_HEIGHT = 168;

/**
 * The fixed 1080 × 1920 frame every Share card is drawn in: the background (flat or a photo under a full-card scrim), the card's content, and a footer with mark A2, the app's wordmark and
 * the Share link and code when the card has one (ADR 0042, 0058). A transparent
 * canvas (a Sticker) has no background and no footer.
 */
export function CardCanvas({
  viewRef,
  palette,
  hasRecords = false,
  photo = null,
  transparent = false,
  link = null,
  children,
}: {
  /** The frame itself, which the capture targets. */
  viewRef?: Ref<View>;
  palette: CardPalette;
  hasRecords?: boolean;
  /** A full-bleed picture drawn under the scrim, for the Photo background. */
  photo?: ReactNode;
  transparent?: boolean;
  /** The Share link and its code, once there is one. */
  link?: { url: string; code: string } | null;
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
              <SigilMark
                size={64}
                color={palette.text}
                emberColor={hasRecords ? palette.record : undefined}
              />
              <Text
                className="font-semibold"
                style={{ fontSize: 36, letterSpacing: 6, color: palette.textSecondary }}
              >
                {appConfig.displayName.toLocaleUpperCase()}
              </Text>
            </View>
            {/* The Share link and its code; empty when the card has none (ADR 0042, 0058). */}
            <View style={{ minWidth: 320, alignItems: "flex-end", gap: 4 }}>
              {link ? (
                <>
                  <Text className="font-medium" style={{ fontSize: 30, color: palette.textMuted }}>
                    {displayLink(link.url)}
                  </Text>
                  <Text
                    className="font-semibold"
                    style={{ fontSize: 34, letterSpacing: 4, color: palette.textSecondary }}
                  >
                    {spacedCode(link.code)}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </View>
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
