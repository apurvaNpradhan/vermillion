import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import { CaretUpDown } from "phosphor-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { BackHandler, Pressable, Text, View, useWindowDimensions } from "react-native";
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import { useKeyboardState, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  ZoomIn,
  ZoomOut,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useCSSVariable } from "uniwind";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { haptic } from "@/platform/haptics";
import { isColorString, useIdentityColor } from "@/platform/theme";
import { useTranslation } from "@/platform/i18n";
import { FloatingSurface } from "@/platform/ui/floating-surface";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { useCurrentTabAction, useTabBarHidden } from "./tab-action";
import { MENU_ROWS_INSET, TabBarMenu, type MenuItem } from "./tab-bar-menu";
import {
  MENU_ROW_HEIGHT,
  PANEL_MIN_WIDTH,
  TAB_BAR_HEIGHT,
  TAB_BAR_PADDING,
  TAB_ITEM_WIDTH,
  useTabBarBottom,
} from "./tab-bar-metrics";
import { scrubIndex, tabSlots } from "./tab-slots";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0] & {
  /** Shown at the top of the switcher's menu (the signed-in account). */
  menuHeader?: (closeMenu: () => void) => ReactNode;
  /** How many tabs get their own button on the pill; the rest are in the menu. */
  directTabCount?: number;
};
type TabRoute = TabBarProps["state"]["routes"][number];

const SIDE = 16;
/** Space kept between the open panel and the compose button. */
const PANEL_ACTION_GAP = 12;
const MENU_GAP = 8;
const INDICATOR = {
  duration: 150,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
const HINT_MS = 1200;
/** Just past the panel's spring, after which its rows no longer move. */
const MENU_SETTLE_MS = 420;

/** Text and icon colour on an `identity` fill; falls back to the canvas colour. */
function useOnIdentityColor(): string | undefined {
  const value = useCSSVariable("--color-on-identity");
  return isColorString(value) ? value : undefined;
}

/**
 * Floating, icon-only tab bar in the manner of Linear's: a pill with the first `directTabCount`
 * tabs (two unless the app says otherwise) and a menu
 * button, plus a round button for the open tab's main action (`useTabAction`). The menu button
 * makes the pill itself grow upward into a panel listing every tab under the account header.
 * Tap it to open, or press and slide up to pick a row in one move. The bar steps aside while the
 * keyboard is up. Tab presses go through `tabPress`, so a second tap scrolls a screen using
 * `useScrollToTop` back to the top.
 */
export function TabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  menuHeader,
  directTabCount,
}: TabBarProps) {
  const { t } = useTranslation();
  const [foreground, muted, background] = useThemeColor(["foreground", "muted", "background"]);
  const bottom = useTabBarBottom();
  const identity = useIdentityColor() ?? foreground;
  const onIdentity = useOnIdentityColor() ?? background;
  const action = useCurrentTabAction();
  const barHidden = useTabBarHidden();
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardVisible = useKeyboardState((keyboardState) => keyboardState.isVisible);
  const { width: windowWidth } = useWindowDimensions();

  const [menuOpen, setMenuOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [hint, setHint] = useState<{ label: string; left: number } | null>(null);
  const rowsRef = useRef<View>(null);
  const rowsTop = useRef<number | null>(null);
  const contentHeight = useSharedValue(TAB_BAR_HEIGHT);

  const routes = state.routes.filter((route) => descriptors[route.key]?.options.tabBarIcon);
  const { direct, overflow } = tabSlots(routes, directTabCount);
  const all = [...direct, ...overflow];
  const activeRoute = state.routes[state.index];
  const activeName = activeRoute?.name ?? "";
  const directIndex = direct.findIndex((route) => route.name === activeName);
  // As in Linear, the menu button shows the open menu screen's icon in place of ⇕.
  const menuActive = overflow.find((route) => route.name === activeName);
  const onMenuButton = menuActive !== undefined;

  const optionsOf = (route: TabRoute) => descriptors[route.key]?.options;
  const labelOf = (route: TabRoute) => optionsOf(route)?.title ?? route.name;
  const iconOf = (route: TabRoute, focused: boolean, color: string) =>
    optionsOf(route)?.tabBarIcon?.({ focused, color, size: 20 });

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setHighlighted(null);
  }, []);

  // Any navigation, including a back gesture, closes the menu.
  useEffect(closeMenu, [activeRoute?.key, closeMenu]);
  useEffect(() => {
    if (!menuOpen) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeMenu();
      return true;
    });
    return () => subscription.remove();
  }, [menuOpen, closeMenu]);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  const open = (route: TabRoute) => {
    closeMenu();
    const focused = route.key === activeRoute?.key;
    const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!focused) haptic.tick();
    if (!focused && !event.defaultPrevented) navigateToTab(route.key);
  };

  // The capsule sits under the open pill tab, or under the menu button when a menu tab is open.
  const indicatorLeft =
    directIndex >= 0
      ? directIndex * TAB_ITEM_WIDTH
      : onMenuButton
        ? direct.length * TAB_ITEM_WIDTH
        : -1;
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: withTiming(indicatorLeft < 0 ? 0 : 1, INDICATOR),
    transform: [{ translateX: withTiming(Math.max(indicatorLeft, 0), INDICATOR) }],
  }));
  // Slides down and fades with the keyboard, frame by frame, or when a screen's own layer
  // (a composer) takes over the bottom of the screen.
  const hiddenProgress = useDerivedValue(() =>
    withTiming(barHidden ? 1 : 0, { duration: 150, reduceMotion: ReduceMotion.System }),
  );
  const barStyle = useAnimatedStyle(() => {
    const away = Math.max(keyboard.progress.value, hiddenProgress.value);
    return {
      opacity: 1 - away,
      transform: [{ translateY: away * (TAB_BAR_HEIGHT + bottom) }],
    };
  });

  const pillWidth = (direct.length + 1) * TAB_ITEM_WIDTH + TAB_BAR_PADDING * 2;
  // As wide as the row allows, stopping short of the compose button, as in Linear.
  const panelWidth = Math.max(
    pillWidth,
    PANEL_MIN_WIDTH,
    windowWidth - SIDE * 2 - TAB_BAR_HEIGHT - PANEL_ACTION_GAP,
  );

  // One surface: the pill grows upward into the panel, its bottom and left edge fixed.
  const progress = useDerivedValue(() => withSpring(menuOpen ? 1 : 0, SHEET_SPRING));
  const surfaceStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [pillWidth, panelWidth], Extrapolation.CLAMP),
    height: interpolate(
      progress.value,
      [0, 1],
      [TAB_BAR_HEIGHT, Math.max(contentHeight.value, TAB_BAR_HEIGHT)],
      Extrapolation.CLAMP,
    ),
  }));
  const tabsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Measured once the spring has settled: mid-animation the rows are still rising, which
  // would map a finger to the neighbouring row.
  useEffect(() => {
    if (!menuOpen) return;
    const timer = setTimeout(() => {
      rowsRef.current?.measureInWindow((_x, y) => {
        rowsTop.current = y + MENU_ROWS_INSET;
      });
    }, MENU_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [menuOpen]);
  const rowAt = (y: number) =>
    rowsTop.current === null
      ? null
      : scrubIndex(y, { top: rowsTop.current, rowHeight: MENU_ROW_HEIGHT, count: all.length });

  // Tap toggles the menu; press and slide up opens it and walks the rows with a tick on each.
  // The handlers run on the JS thread: they only set React state and fire haptics.
  const scrub = useRef<number | null>(null);
  const tap = useTapGesture({
    runOnJS: true,
    onDeactivate: (event) => {
      if (event.canceled) return;
      haptic.tick();
      setMenuOpen((value) => !value);
      setHighlighted(null);
    },
  });
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetY: -8,
    failOffsetX: [-24, 24],
    onActivate: () => {
      haptic.tick();
      scrub.current = null;
      rowsTop.current = null;
      setMenuOpen(true);
    },
    onUpdate: (event) => {
      const index = rowAt(event.absoluteY);
      if (index === scrub.current) return;
      scrub.current = index;
      setHighlighted(index);
      if (index !== null) haptic.tick();
    },
    onDeactivate: (event) => {
      const route = scrub.current === null ? undefined : all[scrub.current];
      scrub.current = null;
      if (route && !event.canceled) open(route);
      else closeMenu();
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const menuItems: MenuItem[] = all.map((route) => {
    const active = route.name === activeName;
    return {
      key: route.key,
      label: labelOf(route),
      active,
      icon: (color) => iconOf(route, active, color),
    };
  });

  return (
    <>
      {menuOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("nav__close_menu")}
          onPress={closeMenu}
          className="absolute inset-0"
        />
      ) : null}

      {barHidden || keyboardVisible ? null : <BottomFade height={bottom + TAB_BAR_HEIGHT + 32} />}
      <Animated.View
        pointerEvents={keyboardVisible || barHidden ? "none" : "box-none"}
        className="absolute inset-0"
        style={barStyle}
      >
        {hint ? (
          <Animated.View
            entering={FadeIn.duration(120).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
            pointerEvents="none"
            className="absolute rounded-lg bg-foreground px-2 py-1"
            style={{ bottom: bottom + TAB_BAR_HEIGHT + MENU_GAP, left: hint.left }}
          >
            <Text className="text-caption font-medium text-background">{hint.label}</Text>
          </Animated.View>
        ) : null}

        <Animated.View className="absolute" style={[{ left: SIDE, bottom }, surfaceStyle]}>
          <FloatingSurface radius={TAB_BAR_HEIGHT / 2} style={{ width: "100%", height: "100%" }}>
            <Animated.View
              className="absolute bottom-0 left-0"
              accessibilityElementsHidden={menuOpen}
              importantForAccessibility={menuOpen ? "no-hide-descendants" : "auto"}
              style={[
                { width: pillWidth, height: TAB_BAR_HEIGHT, padding: TAB_BAR_PADDING },
                tabsStyle,
              ]}
            >
              <View accessibilityRole="tablist" className="flex-1 flex-row">
                <Animated.View
                  pointerEvents="none"
                  className="absolute inset-y-0 left-0 rounded-full bg-identity-soft"
                  style={[{ width: TAB_ITEM_WIDTH }, indicatorStyle]}
                />
                {direct.map((route, index) => {
                  const focused = index === directIndex;
                  const label = labelOf(route);
                  return (
                    <Pressable
                      key={route.key}
                      accessibilityRole="tab"
                      accessibilityLabel={optionsOf(route)?.tabBarAccessibilityLabel ?? label}
                      accessibilityState={{ selected: focused }}
                      onPress={() => open(route)}
                      onLongPress={() => {
                        haptic.tick();
                        emitter.emit({ type: "tabLongPress", target: route.key });
                        setHint({ label, left: SIDE + TAB_BAR_PADDING + index * TAB_ITEM_WIDTH });
                      }}
                      className="h-full items-center justify-center"
                      style={{ width: TAB_ITEM_WIDTH }}
                    >
                      {iconOf(route, focused, focused ? identity : muted)}
                    </Pressable>
                  );
                })}
                <GestureDetector gesture={gesture}>
                  <View
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={
                      menuActive ? `${t("nav__menu")}, ${labelOf(menuActive)}` : t("nav__menu")
                    }
                    accessibilityState={{ expanded: menuOpen, selected: onMenuButton }}
                    accessibilityActions={[{ name: "activate" }]}
                    onAccessibilityAction={() => setMenuOpen((value) => !value)}
                    className="h-full items-center justify-center"
                    style={{ width: TAB_ITEM_WIDTH }}
                  >
                    {menuActive ? (
                      <View className="flex-row items-center gap-0.5">
                        {iconOf(menuActive, true, identity)}
                        <CaretUpDown size={12} color={identity} />
                      </View>
                    ) : (
                      <CaretUpDown size={20} color={muted} />
                    )}
                  </View>
                </GestureDetector>
              </View>
            </Animated.View>

            <Animated.View
              pointerEvents={menuOpen ? "auto" : "none"}
              accessibilityViewIsModal={menuOpen}
              accessibilityElementsHidden={!menuOpen}
              importantForAccessibility={menuOpen ? "yes" : "no-hide-descendants"}
              className="absolute inset-0 overflow-hidden"
              style={[{ borderRadius: TAB_BAR_HEIGHT / 2 }, panelStyle]}
            >
              <View className="absolute top-0 left-0" style={{ width: panelWidth }}>
                <TabBarMenu
                  header={menuHeader?.(closeMenu)}
                  items={menuItems}
                  highlighted={highlighted}
                  identity={identity}
                  muted={muted}
                  rowsRef={rowsRef}
                  onLayout={(event) => {
                    contentHeight.set(event.nativeEvent.layout.height);
                  }}
                  onSelect={(key) => {
                    const route = all.find((candidate) => candidate.key === key);
                    if (route) open(route);
                  }}
                />
              </View>
            </Animated.View>
          </FloatingSurface>
        </Animated.View>

        {action ? (
          <Animated.View
            key={action.label}
            entering={ZoomIn.duration(140).reduceMotion(ReduceMotion.System)}
            exiting={ZoomOut.duration(90).reduceMotion(ReduceMotion.System)}
            className="absolute"
            style={{ right: SIDE, bottom }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                haptic.tick();
                action.onPress();
              }}
              className="items-center justify-center rounded-full bg-identity shadow-overlay active:opacity-90"
              style={{ width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT }}
            >
              <action.icon size={24} color={onIdentity} weight="bold" />
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    </>
  );
}

/**
 * Content melts into the canvas under the bar instead of meeting it at a hard edge. Drawn with
 * SVG so no gradient library is needed; it never takes touches.
 */
function BottomFade({ height }: { height: number }) {
  const background = useThemeColor("background");
  return (
    <View pointerEvents="none" className="absolute inset-x-0 bottom-0" style={{ height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="tab-bar-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={background} stopOpacity={0} />
            <Stop offset="0.7" stopColor={background} stopOpacity={0.85} />
            <Stop offset="1" stopColor={background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tab-bar-fade)" />
      </Svg>
    </View>
  );
}
