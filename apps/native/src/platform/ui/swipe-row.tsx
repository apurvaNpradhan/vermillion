import { cn, useThemeColor } from "heroui-native";
import type { IconProps } from "phosphor-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useSubtleColor } from "@/platform/theme";

import { SWIPE_ACTION_WIDTH, shouldSettleOpen } from "./swipe-threshold";

export type SwipeAction = {
  key: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** `danger` for destructive actions: rose on a faint rose tint, never a filled red. */
  tone?: "default" | "danger";
  /** Show the icon alone; for rows too short to fit a label without clipping it. */
  iconOnly?: boolean;
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
/** Snap open and closed: motion-base, no overshoot. */
const SNAP = { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

type RowHandle = { close: () => void };
type Point = { x: number; y: number };

const SwipeGroupContext = createContext<{
  willOpen: (row: RowHandle) => void;
  didClose: (row: RowHandle) => void;
  closeOpen: () => void;
  /** Where the current touch began, so a cancelled touch can tell a scroll from a swipe. */
  touchStart: { current: Point };
} | null>(null);

/** Rows inside a group close each other: only one is open at a time. */
export function SwipeGroup({ children }: { children: ReactNode }) {
  const parent = useContext(SwipeGroupContext);
  const open = useRef<RowHandle | null>(null);
  const touchStart = useRef<Point>({ x: 0, y: 0 });
  const willOpen = useCallback((row: RowHandle) => {
    if (open.current && open.current !== row) open.current.close();
    open.current = row;
  }, []);
  const didClose = useCallback((row: RowHandle) => {
    if (open.current === row) open.current = null;
  }, []);
  const closeOpen = useCallback(() => {
    open.current?.close();
    open.current = null;
  }, []);
  return (
    <SwipeGroupContext value={parent ?? { willOpen, didClose, closeOpen, touchStart }}>
      {children}
    </SwipeGroupContext>
  );
}

/** Dismisses open actions on outside touches or vertical scrolling throughout the app. */
export function SwipeRoot({ children }: { children: ReactNode }) {
  return (
    <SwipeGroup>
      <SwipeDismissSurface>{children}</SwipeDismissSurface>
    </SwipeGroup>
  );
}

function SwipeDismissSurface({ children }: { children: ReactNode }) {
  const group = useContext(SwipeGroupContext);
  // Capture handlers do not see every touch (Android), and a row stops its touchStart from
  // bubbling here, so the row records its own start into the group and this records the rest.
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={(event) => {
        if (group) group.touchStart.current = pointOf(event.nativeEvent);
        group?.closeOpen();
      }}
      onMoveShouldSetResponderCapture={(event) => {
        const start = group?.touchStart.current;
        if (start && Math.abs(event.nativeEvent.pageY - start.y) > SCROLL_WINS) group?.closeOpen();
        return false;
      }}
      // A native scroll can take the touch before any move reaches JS (Android): the touch is
      // cancelled instead. A mostly vertical cancel is a scroll; a horizontal one is a row's own
      // swipe taking over, which must not close it.
      onTouchCancel={(event) => {
        if (!group) return;
        const start = group.touchStart.current;
        const dx = Math.abs(event.nativeEvent.pageX - start.x);
        const dy = Math.abs(event.nativeEvent.pageY - start.y);
        if (dy >= dx) group.closeOpen();
      }}
    >
      {children}
    </View>
  );
}

/**
 * A left swipe reveals buttons and snaps open or closed; only a button tap runs an action.
 * Screen readers can run the same actions through the content's accessibility menu.
 */
export function SwipeRow({
  actions,
  children,
}: {
  actions: SwipeAction[];
  children: (a11y: SwipeA11yProps) => ReactNode;
}) {
  const group = useContext(SwipeGroupContext);
  const [isOpen, setIsOpen] = useState(false);
  const translateX = useSharedValue(0);
  const start = useSharedValue(0);
  const count = actions.length;
  const panel = count * SWIPE_ACTION_WIDTH + PANEL_GAP;

  const handle = useMemo<RowHandle>(
    () => ({
      close: () => {
        translateX.value = withTiming(0, SNAP);
        setIsOpen(false);
      },
    }),
    [translateX],
  );
  // A row that unmounts while open (navigation, data change) must not stay registered.
  useEffect(() => () => group?.didClose(handle), [group, handle]);
  const close = () => {
    handle.close();
    group?.didClose(handle);
  };
  const onOpened = () => {
    setIsOpen(true);
    group?.willOpen(handle);
  };
  const onDragStart = () => group?.willOpen(handle);
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
      // Resist dragging beyond the buttons; no distance can execute an action.
      translateX.value = next > -panel ? next : -panel + (next + panel) / 3;
    },
    onDeactivate: (event) => {
      const x = translateX.value;
      if (shouldSettleOpen(x, event.velocityX, panel)) {
        translateX.value = withTiming(-panel, SNAP);
        scheduleOnRN(onOpened);
      } else {
        translateX.value = withTiming(0, SNAP);
        scheduleOnRN(close);
      }
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // The panel follows the drag while the row resists beyond its resting width.
  const panelStyle = useAnimatedStyle(() => ({
    width: Math.max(-translateX.value, 0),
    opacity: translateX.value < 0 ? 1 : 0,
  }));

  const a11y: SwipeA11yProps = {
    accessibilityActions: actions.map((action) => ({ name: action.key, label: action.label })),
    onAccessibilityAction: (event) => {
      const action = actions.find((candidate) => candidate.key === event.nativeEvent.actionName);
      if (action) run(action);
    },
  };

  return (
    <GestureDetector gesture={pan}>
      <View
        onTouchStart={(event) => {
          event.stopPropagation();
          if (group) group.touchStart.current = pointOf(event.nativeEvent);
          group?.willOpen(handle);
        }}
      >
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

function pointOf(event: { pageX: number; pageY: number }): Point {
  return { x: event.pageX, y: event.pageY };
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
        {action.iconOnly ? null : (
          <Text
            className={cn(
              "text-caption font-medium",
              tone === "danger" ? "text-danger" : "text-subtle",
            )}
          >
            {action.label}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
