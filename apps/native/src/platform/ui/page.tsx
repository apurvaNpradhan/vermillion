import { type Href, useRouter, useScrollToTop } from "expo-router";
import { useThemeColor } from "heroui-native";
import { CaretLeft } from "phosphor-react-native";
import { useRef, type ReactElement, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTranslation } from "@/platform/i18n";
import { useTabBarClearance } from "@/platform/navigation/tab-bar-metrics";

import { FloatingSurface } from "./floating-surface";

const ROW_HEIGHT = 44;
const ROW_PADDING = 8;
const SIDE = 16;
/** Width of a round header button and the gap after it. */
const BUTTON = 44;
const BUTTON_GAP = 12;
/** Space kept clear on the right of the compact title for a page's action capsule. */
const ACTIONS_CLEARANCE = 128;
/**
 * Scroll distance over which the header changes over: the large title has scrolled most of the
 * way under the bar by the end, so the two titles never show at once.
 */
const COLLAPSE = [20, 40] as const;

/** A scroll view or list the header can send back to the top. */
type ScrollTarget =
  | { scrollTo(options: { y?: number; animated?: boolean }): void }
  | { scrollToOffset(options: { offset: number; animated?: boolean }): void };

/** What a page's scrolling content wires up so the header can follow it. */
export type PageScroll = {
  ref: (node: ScrollTarget | null) => void;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  scrollEventThrottle: number;
  /** Clears the header above and the tab bar below; merge into the content container style. */
  contentContainerStyle: { paddingTop: number; paddingBottom: number };
  /** The large title; render it first in the scrolling content. */
  header: ReactElement;
};

function scrollToTop(target: ScrollTarget | null) {
  if (!target) return;
  if ("scrollToOffset" in target) target.scrollToOffset({ offset: 0, animated: true });
  else target.scrollTo({ y: 0, animated: true });
}

/**
 * The frame of every signed-in page. A large title scrolls with the content; once it has gone,
 * an opaque canvas band fades in with a compact, left-aligned title and a soft edge into the
 * content, as in Linear; no blur at the top. Under the floating tab bar the content blurs
 * progressively. Tapping the compact title, or the open tab again, scrolls to the top. The
 * scroll position is tracked on the UI thread.
 *
 * The page supplies its own scroll view (an `Animated.ScrollView` or an animated list) and
 * spreads the `PageScroll` it is handed; `ScrollPage` does that for plain content.
 */
export function Page({
  title,
  back = false,
  backFallback = "/",
  actions,
  pinned,
  hero,
  children,
}: {
  title: string;
  /** A back button, for pages pushed over another page. */
  back?: boolean;
  backFallback?: Href;
  /** Icon buttons on the right of the header row, in a floating capsule. */
  actions?: ReactNode;
  /**
   * Content that sits in the page under the large title (`header` already reserves `height`
   * for it) and, once the page scrolls, stays pinned under the compact bar.
   * One instance moves, so a focused field keeps focus. Not for pages with a back button.
   */
  pinned?: { height: number; children: ReactNode };
  /**
   * A full-bleed picture at the top of the content, `height` tall from the top of the screen. The
   * content starts at the screen edge, `header` is empty (the page draws its own title), and the
   * compact bar fades in as the picture scrolls under it, so the title appears only once the
   * picture is nearly gone, or over the first `fadeDistance` points when supplied.
   * Pages with a back button only.
   */
  hero?: { height: number; fadeDistance?: number };
  children: (scroll: PageScroll) => ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const clearance = useTabBarClearance();
  const scrollY = useSharedValue(0);
  const target = useRef<ScrollTarget | null>(null);
  useScrollToTop(target);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const rowTop = top + ROW_PADDING;
  const height = rowTop + ROW_HEIGHT + ROW_PADDING;
  // The compact bar fades in over the last 48pt before the picture reaches it.
  const collapse: readonly [number, number] = hero
    ? hero.fadeDistance
      ? [0, hero.fadeDistance]
      : [Math.max(hero.height - height - 48, 1), Math.max(hero.height - height, 2)]
    : COLLAPSE;

  return (
    <View className="flex-1 bg-background">
      <View className="bg-background absolute inset-0">
        {children({
          ref: (node) => {
            target.current = node;
          },
          onScroll,
          scrollEventThrottle: 16,
          // Without a back button the large title shares the header row with the actions.
          contentContainerStyle: {
            paddingTop: hero ? 0 : back ? height : rowTop,
            paddingBottom: clearance,
          },
          header: hero ? (
            <></>
          ) : (
            <>
              <PageTitle title={title} scrollY={scrollY} back={back} collapse={collapse} />
              {pinned ? <View style={{ height: pinned.height }} /> : null}
            </>
          ),
        })}
      </View>
      {hero ? <HeroScrim scrollY={scrollY} height={top + HERO_SCRIM} collapse={collapse} /> : null}
      <PageBar scrollY={scrollY} height={height} collapse={collapse} />
      {pinned ? (
        <PinnedLayer scrollY={scrollY} restTop={rowTop + ROW_HEIGHT} stuckTop={height}>
          {pinned.children}
        </PinnedLayer>
      ) : null}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0 h-11 flex-row items-center justify-between px-4"
        style={{ top: rowTop }}
      >
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("nav__back")}
            onPress={() => (router.canGoBack() ? router.back() : router.replace(backFallback))}
          >
            <FloatingSurface radius={22} className="h-11 w-11 items-center justify-center">
              <BackIcon />
            </FloatingSurface>
          </Pressable>
        ) : (
          <View />
        )}
        {actions ? (
          <FloatingSurface radius={22} className="h-11 flex-row items-center px-1">
            {actions}
          </FloatingSurface>
        ) : null}
        <CompactTitle
          title={title}
          scrollY={scrollY}
          collapse={collapse}
          left={back ? SIDE + BUTTON + BUTTON_GAP : SIDE}
          right={actions ? ACTIONS_CLEARANCE : SIDE}
          onPress={() => scrollToTop(target.current)}
        />
      </View>
    </View>
  );
}

/** A page whose content is a plain list of sections, spaced 24pt apart. */
export function ScrollPage({
  children,
  ...page
}: Omit<Parameters<typeof Page>[0], "children"> & { children: ReactNode }) {
  return (
    <Page {...page}>
      {({ header, contentContainerStyle, ...scroll }) => (
        <Animated.ScrollView
          {...scroll}
          className="flex-1"
          contentContainerClassName="gap-6 px-4"
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {header}
          {children}
        </Animated.ScrollView>
      )}
    </Page>
  );
}

/**
 * The page's pinned content: it rests where the list reserved room for it and rides up with the
 * scroll until it reaches the compact bar, where it stays. An opaque canvas strip keeps the rows
 * that scroll under it from showing through.
 */
function PinnedLayer({
  scrollY,
  restTop,
  stuckTop,
  children,
}: {
  scrollY: SharedValue<number>;
  restTop: number;
  stuckTop: number;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(stuckTop, restTop - scrollY.value) }],
  }));
  return (
    <Animated.View className="bg-background absolute inset-x-0 top-0 px-4 pb-2" style={style}>
      {children}
    </Animated.View>
  );
}

function BackIcon() {
  const foreground = useThemeColor("foreground");
  return <CaretLeft size={20} color={foreground} weight="bold" />;
}

function PageTitle({
  title,
  scrollY,
  back,
  collapse,
}: {
  title: string;
  scrollY: SharedValue<number>;
  back: boolean;
  collapse: readonly [number, number];
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, collapse, [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View className={back ? "pb-2" : "h-11 justify-center"} style={style}>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="font-semibold text-title-xl text-foreground"
      >
        {title}
      </Text>
    </Animated.View>
  );
}

function CompactTitle({
  title,
  scrollY,
  collapse,
  left,
  right,
  onPress,
}: {
  title: string;
  scrollY: SharedValue<number>;
  collapse: readonly [number, number];
  left: number;
  right: number;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, collapse, [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, collapse, [6, 0], Extrapolation.CLAMP) }],
  }));
  return (
    // Left-aligned just right of the back button (or at the page padding), centred vertically in
    // the row; the large title is the heading screen readers use, so this copy is hidden from them.
    <Animated.View
      pointerEvents="box-none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="absolute inset-y-0 items-start justify-center"
      style={[{ left, right }, style]}
    >
      <Pressable onPress={onPress} hitSlop={8}>
        <Text numberOfLines={1} className="font-semibold text-body text-foreground">
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Height of the soft edge under the bar, where content fades out instead of being cut. */
const BAR_FADE = 30;

/**
 * The bar behind the header row, faded in once the page has scrolled: an opaque canvas band
 * over the status bar and header row, with a soft gradient edge into the content below.
 */
function PageBar({
  scrollY,
  height,
  collapse,
}: {
  scrollY: SharedValue<number>;
  height: number;
  collapse: readonly [number, number];
}) {
  const background = useThemeColor("background");
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, collapse, [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-x-0 top-0"
      style={[{ height: height + BAR_FADE }, style]}
    >
      <View className="bg-background" style={{ height }} />
      <Svg width="100%" height={BAR_FADE}>
        <Defs>
          <LinearGradient id="page-bar-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={background} stopOpacity={1} />
            <Stop offset="1" stopColor={background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={BAR_FADE} fill="url(#page-bar-fade)" />
      </Svg>
    </Animated.View>
  );
}

/** Height of the scrim below the status bar inset; it reaches past the back button. */
const HERO_SCRIM = 60;

/**
 * A canvas-coloured wash over the top of a hero picture, behind the status bar and the header
 * buttons. The status bar icons follow the theme (dark on the light canvas, light on the dark
 * one), so a picture that happens to be white under them would hide them; the wash is the same
 * canvas colour, so they always read. It hands over to the opaque bar as the page scrolls.
 */
function HeroScrim({
  scrollY,
  height,
  collapse,
}: {
  scrollY: SharedValue<number>;
  height: number;
  collapse: readonly [number, number];
}) {
  const background = useThemeColor("background");
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, collapse, [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-x-0 top-0"
      style={[{ height }, style]}
    >
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="hero-scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={background} stopOpacity={0.9} />
            <Stop offset="0.55" stopColor={background} stopOpacity={0.55} />
            <Stop offset="1" stopColor={background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={height} fill="url(#hero-scrim)" />
      </Svg>
    </Animated.View>
  );
}
