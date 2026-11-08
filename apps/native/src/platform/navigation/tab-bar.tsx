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
import { BackHandler, Pressable, Text, View } from "react-native";
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
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { FloatingSurface } from "@/platform/ui/floating-surface";

import { useCurrentTabAction } from "./tab-action";
import { TabBarMenu, type MenuItem } from "./tab-bar-menu";
import {
  MENU_ROW_HEIGHT,
  SWITCHER_WIDTH,
  TAB_BAR_HEIGHT,
  TAB_BAR_PADDING,
  TAB_ITEM_WIDTH,
  useTabBarBottom,
} from "./tab-bar-metrics";
import { scrubIndex, switcherRoute, tabSlots } from "./tab-slots";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0] & {
  /** Shown at the top of the switcher's menu (the signed-in account). */
  menuHeader?: ReactNode;
};
type TabRoute = TabBarProps["state"]["routes"][number];

const SIDE = 16;
const MENU_GAP = 8;
/** Padding inside the menu's row list, above the first row. */
const MENU_ROWS_INSET = 8;
const INDICATOR = {
  duration: 200,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
const HINT_MS = 1200;
/** Just past the menu's 200ms opening animation. */
const MENU_SETTLE_MS = 220;

/**
 * Floating, icon-only tab bar in the manner of Linear's: a pill with the first tabs, a switcher
 * whose menu holds the rest, and a round button for the open tab's main action (`useTabAction`).
 * Tap the switcher to open its menu, or press and slide up to pick a row in one move. The bar
 * steps aside while the keyboard is up. Tab presses go through `tabPress`, so a second tap
 * scrolls a screen using `useScrollToTop` back to the top.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, menuHeader }: TabBarProps) {
  const { t } = useTranslation();
  const [foreground, muted, accentForeground] = useThemeColor([
    "foreground",
    "muted",
    "accent-foreground",
  ]);
  const bottom = useTabBarBottom();
  const action = useCurrentTabAction();
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardVisible = useKeyboardState((keyboardState) => keyboardState.isVisible);

  const [menuOpen, setMenuOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [hint, setHint] = useState<{ label: string; left: number } | null>(null);
  const lastOverflow = useRef<string | null>(null);
  const rowsRef = useRef<View>(null);
  const rowsTop = useRef<number | null>(null);

  const routes = state.routes.filter((route) => descriptors[route.key]?.options.tabBarIcon);
  const { direct, overflow } = tabSlots(routes);
  const activeRoute = state.routes[state.index];
  const activeName = activeRoute?.name ?? "";
  const overflowNames = overflow.map((route) => route.name);
  const switcherName = switcherRoute(overflowNames, activeName, lastOverflow.current);
  const switcher = overflow.find((route) => route.name === switcherName);
  const directIndex = direct.findIndex((route) => route.name === activeName);
  const onSwitcher = switcher !== undefined && switcher.name === activeName;

  const optionsOf = (route: TabRoute) => descriptors[route.key]?.options;
  const labelOf = (route: TabRoute) => optionsOf(route)?.title ?? route.name;
  const iconOf = (route: TabRoute, focused: boolean, color: string) =>
    optionsOf(route)?.tabBarIcon?.({ focused, color, size: 22 });

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setHighlighted(null);
  }, []);

  useEffect(() => {
    if (overflowNames.includes(activeName)) lastOverflow.current = activeName;
  });
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

  // The indicator sits under the open pill tab, or under the switcher when a menu tab is open.
  const indicatorLeft =
    directIndex >= 0
      ? directIndex * TAB_ITEM_WIDTH
      : onSwitcher
        ? direct.length * TAB_ITEM_WIDTH
        : -1;
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: withTiming(indicatorLeft < 0 ? 0 : 1, INDICATOR),
    width: withTiming(directIndex >= 0 ? TAB_ITEM_WIDTH : SWITCHER_WIDTH, INDICATOR),
    transform: [{ translateX: withTiming(Math.max(indicatorLeft, 0), INDICATOR) }],
  }));
  // Slides down and fades with the keyboard, frame by frame.
  const barStyle = useAnimatedStyle(() => ({
    opacity: 1 - keyboard.progress.value,
    transform: [{ translateY: keyboard.progress.value * (TAB_BAR_HEIGHT + bottom) }],
  }));

  // Measured once the opening animation has settled: mid-animation the menu is scaled and
  // shifted, which would map a finger to the neighbouring row.
  const measureRows = () => {
    setTimeout(() => {
      rowsRef.current?.measureInWindow((_x, y) => {
        rowsTop.current = y + MENU_ROWS_INSET;
      });
    }, MENU_SETTLE_MS);
  };
  const rowAt = (y: number) =>
    rowsTop.current === null
      ? null
      : scrubIndex(y, { top: rowsTop.current, rowHeight: MENU_ROW_HEIGHT, count: overflow.length });

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
      const route = scrub.current === null ? undefined : overflow[scrub.current];
      scrub.current = null;
      if (route && !event.canceled) open(route);
      else closeMenu();
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const menuItems: MenuItem[] = overflow.map((route) => {
    const active = route.name === activeName;
    return {
      key: route.key,
      label: labelOf(route),
      active,
      icon: (color) => iconOf(route, active, color),
    };
  });
  const pillWidth =
    direct.length * TAB_ITEM_WIDTH + (switcher ? SWITCHER_WIDTH : 0) + TAB_BAR_PADDING * 2;

  return (
    <>
      {menuOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("nav__close_menu")}
          onPress={closeMenu}
          className="absolute inset-0 bg-backdrop"
        />
      ) : null}
      {menuOpen ? (
        <TabBarMenu
          header={menuHeader}
          items={menuItems}
          highlighted={highlighted}
          bottom={bottom + TAB_BAR_HEIGHT + MENU_GAP}
          left={SIDE}
          rowsRef={rowsRef}
          onRowsLayout={measureRows}
          onSelect={(key) => {
            const route = overflow.find((candidate) => candidate.key === key);
            if (route) open(route);
          }}
        />
      ) : null}

      <BottomFade height={bottom + TAB_BAR_HEIGHT + 32} />
      <Animated.View
        pointerEvents={keyboardVisible ? "none" : "box-none"}
        className="absolute inset-x-0 flex-row items-end justify-between"
        style={[{ bottom, paddingHorizontal: SIDE }, barStyle]}
      >
        {hint ? (
          <Animated.View
            entering={FadeIn.duration(120).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
            pointerEvents="none"
            className="absolute rounded-lg bg-foreground px-2 py-1"
            style={{ bottom: TAB_BAR_HEIGHT + MENU_GAP, left: hint.left }}
          >
            <Text className="text-caption font-medium text-background">{hint.label}</Text>
          </Animated.View>
        ) : null}

        <FloatingSurface
          radius={TAB_BAR_HEIGHT / 2}
          style={{ height: TAB_BAR_HEIGHT, width: pillWidth, padding: TAB_BAR_PADDING }}
        >
          <View accessibilityRole="tablist" className="flex-1 flex-row">
            <Animated.View
              pointerEvents="none"
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/10"
              style={indicatorStyle}
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
                  {iconOf(route, focused, focused ? foreground : muted)}
                </Pressable>
              );
            })}
            {switcher ? (
              <GestureDetector gesture={gesture}>
                <View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={t("nav__more", { current: labelOf(switcher) })}
                  accessibilityState={{ expanded: menuOpen, selected: onSwitcher }}
                  accessibilityActions={[{ name: "activate" }]}
                  onAccessibilityAction={() => setMenuOpen((value) => !value)}
                  className="h-full flex-row items-center justify-center gap-0.5"
                  style={{ width: SWITCHER_WIDTH }}
                >
                  {iconOf(switcher, onSwitcher, onSwitcher ? foreground : muted)}
                  <CaretUpDown size={14} color={muted} weight="bold" />
                </View>
              </GestureDetector>
            ) : null}
          </View>
        </FloatingSurface>

        {action ? (
          <Animated.View
            key={action.label}
            entering={ZoomIn.duration(200).reduceMotion(ReduceMotion.System)}
            exiting={ZoomOut.duration(120).reduceMotion(ReduceMotion.System)}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                haptic.tick();
                action.onPress();
              }}
              className="items-center justify-center rounded-full bg-accent shadow-overlay active:opacity-90"
              style={{ width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT }}
            >
              <action.icon size={24} color={accentForeground} weight="bold" />
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
