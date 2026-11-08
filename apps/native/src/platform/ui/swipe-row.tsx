import { cn, useThemeColor } from "heroui-native";
import type { IconProps } from "phosphor-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Pressable, Text, View, type AccessibilityActionEvent } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";
import { useSubtleColor } from "@/platform/theme";

import { SWIPE_ACTION_WIDTH, isFullSwipe } from "./swipe-threshold";

export type SwipeAction = {
  key: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** `danger` for destructive actions: rose on a faint rose tint, never a filled red. */
  tone?: "default" | "danger";
  onPress: () => void;
};

/** Accessibility props for the row's content, so screen readers can reach the swipe actions. */
export type SwipeA11yProps = {
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (event: AccessibilityActionEvent) => void;
};

/** Horizontal travel before a swipe starts. */
const SWIPE_START = 16;
/** Vertical travel that hands the touch to the list's scroll instead. */
const SCROLL_WINS = 10;
/** Space between the row and its first action button. */
const PANEL_GAP = 12;
/** A fling this fast to the left opens the row even when it was dragged less than halfway. */
const OPEN_VELOCITY = -500;
/** Snap open and closed: motion-base, no overshoot. */
const SNAP = { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

type RowHandle = { close: () => void };

const SwipeGroupContext = createContext<{
  willOpen: (row: RowHandle) => void;
  didClose: (row: RowHandle) => void;
} | null>(null);

/** Rows inside a group close each other: only one is open at a time. */
export function SwipeGroup({ children }: { children: ReactNode }) {
  const open = useRef<RowHandle | null>(null);
  const willOpen = useCallback((row: RowHandle) => {
    if (open.current && open.current !== row) open.current.close();
    open.current = row;
  }, []);
  const didClose = useCallback((row: RowHandle) => {
    if (open.current === row) open.current = null;
  }, []);
  return <SwipeGroupContext value={{ willOpen, didClose }}>{children}</SwipeGroupContext>;
}

/**
 * A row that slides left to reveal actions behind it, in the manner of PanelUI's Swipe. The drag
 * starts only after a clear sideways move and gives way to the list as soon as the finger moves
 * vertically, so scrolling that starts on a row still scrolls. Dragging well past the buttons and
 * letting go fires the outermost (last) action, with a tick when the drag crosses that point.
 * While open, a tap on the row closes it. The same actions are offered to screen readers through
 * `accessibilityActions`, which the row's content spreads from the render prop.
 */
export function SwipeRow({
  actions,
  fullSwipe = true,
  children,
}: {
  actions: SwipeAction[];
  fullSwipe?: boolean;
  children: (a11y: SwipeA11yProps) => ReactNode;
}) {
  const group = useContext(SwipeGroupContext);
  const [width, setWidth] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const translateX = useSharedValue(0);
  const start = useSharedValue(0);
  const count = actions.length;
  const panel = count * SWIPE_ACTION_WIDTH + PANEL_GAP;
  const outermost = actions.at(-1);

  const handle = useMemo<RowHandle>(
    () => ({
      close: () => {
        translateX.value = withTiming(0, SNAP);
        setIsOpen(false);
      },
    }),
    [translateX],
  );
  const close = () => {
    handle.close();
    group?.didClose(handle);
  };
  const onOpened = () => {
    setIsOpen(true);
    group?.willOpen(handle);
  };
  const onDragStart = () => group?.willOpen(handle);
  const onFullSwipe = () => {
    setIsOpen(false);
    group?.didClose(handle);
    outermost?.onPress();
  };
  const run = (action: SwipeAction) => {
    close();
    action.onPress();
  };

  const pan = usePanGesture({
    activeOffsetX: [-SWIPE_START, SWIPE_START],
    failOffsetY: [-SCROLL_WINS, SCROLL_WINS],
    onActivate: () => {
      start.value = translateX.value;
      scheduleOnRN(onDragStart);
    },
    onUpdate: (event) => {
      const next = Math.min(0, start.value + event.translationX);
      // Past the buttons the row follows the finger for a full swipe, or resists without one.
      translateX.value = fullSwipe || next > -panel ? next : -panel + (next + panel) / 3;
    },
    onDeactivate: (event) => {
      const x = translateX.value;
      if (fullSwipe && outermost && isFullSwipe(x, width, count)) {
        // Slide out, fire, then come back unseen (the row is usually hidden by then).
        translateX.value = withTiming(-width, SNAP, () => {
          translateX.value = withDelay(400, withTiming(0, { duration: 0 }));
        });
        scheduleOnRN(onFullSwipe);
      } else if (x < -panel / 2 || event.velocityX < OPEN_VELOCITY) {
        translateX.value = withTiming(-panel, SNAP);
        scheduleOnRN(onOpened);
      } else {
        translateX.value = withTiming(0, SNAP);
        scheduleOnRN(close);
      }
    },
  });

  useAnimatedReaction(
    () => fullSwipe && isFullSwipe(translateX.value, width, count),
    (armed, previous) => {
      // Tick on crossing into a full swipe only, not on the way back.
      if (armed && previous === false) scheduleOnRN(haptic.tick);
    },
    [width, count, fullSwipe],
  );

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // The panel widens with the drag; past the buttons the outermost action fills it.
  const panelStyle = useAnimatedStyle(() => ({
    width: Math.max(-translateX.value, 0),
    opacity: translateX.value < 0 ? 1 : 0,
  }));

  const a11y: SwipeA11yProps = {
    accessibilityActions: actions.map((action) => ({ name: action.key, label: action.label })),
    onAccessibilityAction: (event) => {
      const action = actions.find((candidate) => candidate.key === event.nativeEvent.actionName);
      if (action) action.onPress();
    },
  };

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <Animated.View
          className="absolute inset-y-0 right-0 flex-row justify-end overflow-hidden"
          style={[{ paddingLeft: PANEL_GAP - 8 }, panelStyle]}
        >
          {actions.map((action, index) => (
            <SwipeButton
              key={action.key}
              action={action}
              grows={index === count - 1}
              onPress={() => run(action)}
            />
          ))}
        </Animated.View>
        <Animated.View style={rowStyle}>
          {children(a11y)}
          {isOpen ? (
            // While open, the first tap on the row closes it instead of opening it.
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={close}
              className="absolute inset-0"
            />
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function SwipeButton({
  action,
  grows,
  onPress,
}: {
  action: SwipeAction;
  grows: boolean;
  onPress: () => void;
}) {
  const danger = useThemeColor("danger");
  const subtle = useSubtleColor();
  const tone = action.tone ?? "default";
  const color = tone === "danger" ? danger : subtle;
  return (
    <View className={cn(grows && "flex-1")} style={{ minWidth: SWIPE_ACTION_WIDTH }}>
      <Pressable
        // The swipe already announced this action; the button repeats it for touch only.
        importantForAccessibility="no"
        accessibilityElementsHidden
        onPress={onPress}
        className={cn(
          "ml-2 flex-1 items-center justify-center gap-1 rounded-2xl",
          tone === "danger" ? "bg-danger/15" : "bg-default",
        )}
      >
        <action.icon size={20} color={color} weight="bold" />
        <Text
          className={cn(
            "text-caption font-medium",
            tone === "danger" ? "text-danger" : "text-subtle",
          )}
        >
          {action.label}
        </Text>
      </Pressable>
    </View>
  );
}
