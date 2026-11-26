import { cn, useThemeColor } from "heroui-native";
import type { IconProps } from "phosphor-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useId,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Pressable, View, type AccessibilityActionEvent } from "react-native";
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
import { dismissSwipeRow, releaseSwipeRow } from "./swipe-ownership";

export type SwipeAction = {
  key: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** `danger` for destructive actions: rose on a faint rose tint, never a filled red. */
  tone?: "default" | "danger";
  /** One line under the label in a sheet (the swipe shows only the label). */
  description?: string;
  onPress: () => void;
};

/** Accessibility props for the row's content, so screen readers can reach the swipe actions. */
export type SwipeA11yProps = {
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (event: AccessibilityActionEvent) => void;
};

/** Horizontal travel before a swipe starts. */
const SWIPE_START = 16;
/** Vertical travel before the pan gives up; looser than a scroll so a diagonal swipe survives. */
const PAN_FAIL_Y = 20;
/** Space between the row and its first action button. */
const PANEL_GAP = 12;
const PANEL_PADDING = { paddingLeft: PANEL_GAP - 8 };
/** Until the animated style registers, the panel is zero-width and invisible. */
const HIDDEN_PANEL = { width: 0, opacity: 0 };
/** Snap open and closed: motion-base, no overshoot. */
const SNAP = { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

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

type SwipeGroupState = {
  openRow: SharedValue<string | null>;
  dragOwner: SharedValue<string | null>;
};

const SwipeGroupContext = createContext<SwipeGroupState | null>(null);

function useSwipeGroupState() {
  const openRow = useSharedValue<string | null>(null);
  const dragOwner = useSharedValue<string | null>(null);
  return useMemo(() => ({ openRow, dragOwner }), [openRow, dragOwner]);
}

/** Rows inside a group close each other: only one is open at a time. */
export function SwipeGroup({ children }: { children: ReactNode }) {
  const parent = useContext(SwipeGroupContext);
  const group = useSwipeGroupState();
  return <SwipeGroupContext value={parent ?? group}>{children}</SwipeGroupContext>;
}

function dismissOpenRow(
  openRow: SwipeGroupState["openRow"],
  dragOwner: SwipeGroupState["dragOwner"],
  except?: string,
) {
  "worklet";
  openRow.set(dismissSwipeRow(openRow.get(), dragOwner.get(), except));
}

function useDismissOpenRow() {
  const group = useContext(SwipeGroupContext);
  return useCallback(
    (except?: string) => {
      if (group) scheduleOnUI(dismissOpenRow, group.openRow, group.dragOwner, except);
    },
    [group],
  );
}

/** Use on a list's onScrollBeginDrag to close actions as the list takes the gesture. */
export function useDismissSwipeRows() {
  const dismiss = useDismissOpenRow();
  return useCallback(() => dismiss(), [dismiss]);
}

/** Dismisses open actions on outside touches throughout the app. */
export function SwipeRoot({ children }: { children: ReactNode }) {
  return (
    <SwipeGroup>
      <SwipeDismissSurface>{children}</SwipeDismissSurface>
    </SwipeGroup>
  );
}

function SwipeDismissSurface({ children }: { children: ReactNode }) {
  const dismiss = useDismissSwipeRows();
  return (
    <View style={{ flex: 1 }} onTouchStart={() => dismiss()}>
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
  onOpen,
  children,
}: {
  actions: SwipeAction[];
  motion?: boolean;
  /** What screen readers can run: more than the swipe shows, when the row has a menu. */
  screenReaderActions?: SwipeAction[];
  onOpen?: () => void;
  children: (a11y: SwipeA11yProps) => ReactNode;
}) {
  const group = useContext(SwipeGroupContext);
  const localGroup = useSwipeGroupState();
  const { openRow, dragOwner } = group ?? localGroup;
  const row = useId();
  const dismissOtherRows = useDismissOpenRow();
  const [presentation, setPresentation] = useState<ReturnType<typeof swipePresentation>>("hidden");
  const phase = useSharedValue<SwipePhase>("idle");
  const touching = useSharedValue(false);
  const translateX = useSharedValue(0);
  const start = useSharedValue(0);
  const panel = actions.length * SWIPE_ACTION_WIDTH + PANEL_GAP;

  useEffect(
    () => () => {
      scheduleOnUI(() => {
        "worklet";
        openRow.set(releaseSwipeRow(openRow.get(), row));
        dragOwner.set(releaseSwipeRow(dragOwner.get(), row));
      });
    },
    [openRow, dragOwner, row],
  );
  const close = () => {
    scheduleOnUI(() => {
      "worklet";
      if (dragOwner.get() !== row) openRow.set(releaseSwipeRow(openRow.get(), row));
    });
  };
  const run = (action: SwipeAction) => {
    close();
    action.onPress();
  };

  // A second pan can replace the open row even while the first finger is still down.
  useAnimatedReaction(
    () => openRow.get(),
    (current) => {
      if (current !== row) closeSwipe(translateX, phase, motion);
    },
  );

  const pan = usePanGesture({
    activeOffsetX: [-SWIPE_START, SWIPE_START],
    failOffsetY: [-PAN_FAIL_Y, PAN_FAIL_Y],
    onBegin: () => touching.set(true),
    onActivate: () => {
      cancelAnimation(translateX);
      start.set(translateX.get());
      phase.set(swipePhase(phase.get(), "drag"));
      openRow.set(row);
      dragOwner.set(row);
    },
    onUpdate: (event) => {
      if (dragOwner.get() !== row) return;
      const next = Math.min(0, start.get() + event.translationX);
      // Resist dragging beyond the buttons; no distance can execute an action.
      translateX.set(next > -panel ? next : -panel + (next + panel) / 3);
    },
    onDeactivate: (event) => {
      if (dragOwner.get() !== row) return;
      if (!event.canceled && shouldSettleOpen(translateX.get(), event.velocityX, panel)) {
        translateX.set(motion ? withTiming(-panel, SNAP) : -panel);
        phase.set(swipePhase(phase.get(), "open"));
        if (onOpen) scheduleOnRN(onOpen);
      } else {
        openRow.set(releaseSwipeRow(openRow.get(), row));
        closeSwipe(translateX, phase, motion);
      }
    },
    onFinalize: () => {
      touching.set(false);
      dragOwner.set(releaseSwipeRow(dragOwner.get(), row));
    },
  });

  const syncPresentation = (next: ReturnType<typeof swipePresentation>) => {
    // The UI can start a new touch before this notification gets to React.
    if (swipePresentation(phase.get(), touching.get()) !== next) return;
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
          dismissOtherRows(row);
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
          "ml-2 flex-1 items-center justify-center rounded-2xl",
          tone === "danger" ? "bg-danger/15" : "bg-default",
        )}
      >
        <action.icon size={20} color={color} />
      </Pressable>
    </View>
  );
}
