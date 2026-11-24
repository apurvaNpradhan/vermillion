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
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { useSubtleColor } from "@/platform/theme";

import { swipePhase, swipePresentation, type SwipePhase } from "./swipe-phase";
import { SWIPE_ACTION_WIDTH, shouldSettleOpen } from "./swipe-threshold";
import { rowToClose, shouldCloseOnTouchCancel, type TouchPoint } from "./swipe-touch";

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
/** Vertical travel before the pan gives up; looser than a scroll so a diagonal swipe survives. */
const PAN_FAIL_Y = 20;
/** Space between the row and its first action button. */
const PANEL_GAP = 12;
const PANEL_PADDING = { paddingLeft: PANEL_GAP - 8 };
/** Until the animated style registers, the panel is zero-width and invisible. */
const HIDDEN_PANEL = { width: 0, opacity: 0 };
/** Snap open and closed: motion-base, no overshoot. */
const SNAP = { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

type RowHandle = { close: () => void };
type Point = TouchPoint;

function closeSwipe(
  translateX: SharedValue<number>,
  phase: SharedValue<SwipePhase>,
  motion: boolean,
) {
  "worklet";
  const current = phase.get();
  if (current === "idle" || current === "closing") return;
  if (!motion) {
    translateX.set(0);
    phase.set(swipePhase(current, "reset"));
    return;
  }
  phase.set(swipePhase(current, "close"));
  translateX.set(
    withTiming(0, SNAP, (finished) => {
      if (finished) phase.set(swipePhase(phase.get(), "rest"));
    }),
  );
}

const SwipeGroupContext = createContext<{
  willOpen: (row: RowHandle) => void;
  didClose: (row: RowHandle) => void;
  closeOpen: () => void;
  /** The row whose pan is active: it must never be closed by its own touch events. */
  setDragging: (row: RowHandle | null) => void;
  isDragging: () => boolean;
  /** Where the current touch began, so a cancelled touch can tell a scroll from a swipe. */
  touchStart: { current: Point };
} | null>(null);

/** Rows inside a group close each other: only one is open at a time. */
export function SwipeGroup({ children }: { children: ReactNode }) {
  const parent = useContext(SwipeGroupContext);
  const open = useRef<RowHandle | null>(null);
  const touchStart = useRef<Point>({ x: 0, y: 0 });
  const dragging = useRef<RowHandle | null>(null);
  const willOpen = useCallback((row: RowHandle) => {
    if (open.current && open.current !== row) open.current.close();
    open.current = row;
  }, []);
  const didClose = useCallback((row: RowHandle) => {
    if (open.current === row) open.current = null;
  }, []);
  const closeOpen = useCallback(() => {
    const row = rowToClose(open.current, dragging.current);
    if (row === null) return;
    row.close();
    open.current = null;
  }, []);
  const setDragging = useCallback((row: RowHandle | null) => {
    dragging.current = row;
  }, []);
  const isDragging = useCallback(() => dragging.current !== null, []);
  return (
    <SwipeGroupContext
      value={parent ?? { willOpen, didClose, closeOpen, setDragging, isDragging, touchStart }}
    >
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
      // cancelled instead. A mostly vertical cancel is a scroll; a row's own pan cancels the touch
      // too (Android reports it at 0,0), which must not close that row.
      onTouchCancel={(event) => {
        if (!group) return;
        if (
          shouldCloseOnTouchCancel(
            group.touchStart.current,
            pointOf(event.nativeEvent),
            group.isDragging(),
          )
        ) {
          group.closeOpen();
        }
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
  motion = true,
  screenReaderActions = actions,
  children,
}: {
  actions: SwipeAction[];
  motion?: boolean;
  /** What screen readers can run: more than the swipe shows, when the row has a menu. */
  screenReaderActions?: SwipeAction[];
  children: (a11y: SwipeA11yProps) => ReactNode;
}) {
  const group = useContext(SwipeGroupContext);
  const [presentation, setPresentation] = useState<ReturnType<typeof swipePresentation>>("hidden");
  const phase = useSharedValue<SwipePhase>("idle");
  const touching = useSharedValue(false);
  const translateX = useSharedValue(0);
  const start = useSharedValue(0);
  const panel = actions.length * SWIPE_ACTION_WIDTH + PANEL_GAP;

  const handle = useMemo<RowHandle>(
    () => ({
      close: () => scheduleOnUI(closeSwipe, translateX, phase, motion),
    }),
    [motion, phase, translateX],
  );
  // A row that unmounts while open (navigation, data change) must not stay registered.
  useEffect(() => () => group?.didClose(handle), [group, handle]);
  const close = () => {
    handle.close();
    group?.didClose(handle);
  };
  const onDragStart = () => {
    group?.willOpen(handle);
    group?.setDragging(handle);
  };
  const onDragEnd = () => group?.setDragging(null);
  const run = (action: SwipeAction) => {
    close();
    action.onPress();
  };

  const pan = usePanGesture({
    activeOffsetX: [-SWIPE_START, SWIPE_START],
    failOffsetY: [-PAN_FAIL_Y, PAN_FAIL_Y],
    onBegin: () => touching.set(true),
    onActivate: () => {
      cancelAnimation(translateX);
      start.set(translateX.get());
      phase.set(swipePhase(phase.get(), "drag"));
      scheduleOnRN(onDragStart);
    },
    onUpdate: (event) => {
      const current = phase.get();
      if (current === "idle") return;
      // Grabbed while a close was animating: the finger takes over from where the row is.
      if (current === "closing") {
        cancelAnimation(translateX);
        start.set(translateX.get() - event.translationX);
        phase.set(swipePhase(current, "drag"));
      }
      const next = Math.min(0, start.get() + event.translationX);
      // Resist dragging beyond the buttons; no distance can execute an action.
      translateX.set(next > -panel ? next : -panel + (next + panel) / 3);
    },
    onDeactivate: (event) => {
      const current = phase.get();
      if (current === "idle") return;
      if (shouldSettleOpen(translateX.get(), event.velocityX, panel)) {
        translateX.set(motion ? withTiming(-panel, SNAP) : -panel);
        phase.set(swipePhase(current, "open"));
      } else {
        closeSwipe(translateX, phase, motion);
      }
    },
    onFinalize: () => {
      touching.set(false);
      scheduleOnRN(onDragEnd);
    },
  });

  const syncPresentation = (next: ReturnType<typeof swipePresentation>) => {
    if (next === "hidden") {
      // The UI can start a new touch before this notification gets to React.
      if (swipePresentation(phase.get(), touching.get()) !== "hidden") return;
      group?.didClose(handle);
    }
    setPresentation(next);
  };
  useAnimatedReaction(
    () => swipePresentation(phase.get(), touching.get()),
    (next, previous) => {
      if (next !== previous && (previous !== null || next !== "hidden")) {
        scheduleOnRN(syncPresentation, next);
      }
    },
  );

  // The row follows the finger on the UI thread; the action layer stays invisible until its own
  // animated style is registered, so the row never waits on a JS state update.
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));

  const a11y: SwipeA11yProps = {
    accessibilityActions: screenReaderActions.map((action) => ({
      name: action.key,
      label: action.label,
    })),
    onAccessibilityAction: (event) => {
      const action = screenReaderActions.find(
        (candidate) => candidate.key === event.nativeEvent.actionName,
      );
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
        {presentation === "hidden" ? null : (
          <ActionLayer translateX={translateX} actions={actions} onRun={run} />
        )}
        <Animated.View style={rowStyle}>
          {children(a11y)}
          {presentation === "open" ? (
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

/** The buttons behind a row: mounted only while a swipe is under way, open or closing. */
function ActionLayer({
  translateX,
  actions,
  onRun,
}: {
  translateX: SharedValue<number>;
  actions: SwipeAction[];
  onRun: (action: SwipeAction) => void;
}) {
  // The panel follows the drag while the row resists beyond its resting width.
  const panelStyle = useAnimatedStyle(() => {
    const width = Math.max(-translateX.get(), 0);
    return { width, opacity: width > 0 ? 1 : 0 };
  });
  const last = actions.length - 1;
  return (
    <Animated.View
      className="absolute inset-y-0 right-0 flex-row justify-end overflow-hidden"
      style={[PANEL_PADDING, HIDDEN_PANEL, panelStyle]}
    >
      {actions.map((action, index) => (
        <SwipeButton
          key={action.key}
          action={action}
          grows={index === last}
          onPress={() => onRun(action)}
        />
      ))}
    </Animated.View>
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
        <action.icon size={20} color={color} />
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
