import {
  createContext,
  useContext,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View, type ViewProps, type LayoutChangeEvent } from "react-native";
import { GestureDetector, GestureStateManager, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  measure,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  scrollTo,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";

import { autoScrollSpeed, beforeIdOf, indexFromPosition, movedOrder, slotOf } from "../reorder";
import type { useReorderScroll } from "../use-reorder-scroll";

// SAFETY: Reanimated accepts this literal animation configuration.
const SETTLE = {
  damping: 39,
  stiffness: 600,
  mass: 0.7,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;
// SAFETY: Reanimated accepts this literal animation configuration.
const COLLAPSE = { duration: 220, reduceMotion: ReduceMotion.System } as const;
type Scroll = ReturnType<typeof useReorderScroll>;
type Drag = {
  active: SharedValue<number>;
  target: SharedValue<number>;
  progress: SharedValue<number>;
  finger: SharedValue<number>;
  anchor: SharedValue<number>;
  listY: SharedValue<number>;
  heights: SharedValue<number[]>;
  dropping: SharedValue<boolean>;
};

const HeaderGesture = createContext<ReturnType<typeof usePanGesture> | null>(null);

/** Attach the row gesture to its header, leaving the set grid outside the detector. */
export function ReorderHeader(props: ViewProps) {
  const gesture = useContext(HeaderGesture);
  const header = <View {...props} collapsable={false} />;
  return gesture ? <GestureDetector gesture={gesture}>{header}</GestureDetector> : header;
}

/** Header-only long press. All movement, collapse and edge scrolling stay on the UI thread. */
export function ReorderList<T extends { id: string }>({
  items,
  renderItem,
  onMove,
  scroll,
  headerHeight = 72,
  topInset = 0,
  bottomInset = 0,
  onDragStart,
  enabled = true,
}: {
  items: readonly T[];
  renderItem: (item: T, state: { collapsed: boolean }) => ReactNode;
  onMove: (id: string, beforeId: string | null) => void;
  scroll: Scroll;
  headerHeight?: number;
  /** Overlays above/below the scroll view, such as Page chrome and the tab bar. */
  topInset?: number;
  bottomInset?: number;
  onDragStart?: () => void;
  enabled?: boolean;
}) {
  const [local, setLocal] = useState<string[] | null>(null);
  const incoming = items.map((item) => item.id);
  const incomingKey = incoming.join("|");
  // Retain optimistic order through intermediate watch emissions. A membership change is authoritative.
  useEffect(() => {
    if (
      local &&
      (local.join("|") === incomingKey ||
        local.length !== incoming.length ||
        local.some((id) => !incoming.includes(id)))
    )
      setLocal(null);
  }, [incomingKey, incoming, local]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = (local ?? incoming).flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const listRef = useAnimatedRef<View>();
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const progress = useSharedValue(0);
  const finger = useSharedValue(0);
  const anchor = useSharedValue(0);
  const listY = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);
  const dropping = useSharedValue(false);
  const drag = { active, target, progress, finger, anchor, listY, heights, dropping };
  const count = ordered.length;
  const { ref: scrollRef, offset: scrollOffset, contentHeight } = scroll;

  useLayoutEffect(() => {
    if (!dropping.value) return;
    active.value = -1;
    target.value = -1;
    dropping.value = false;
    scroll.dragging.value = false;
    progress.value = withTiming(0, COLLAPSE);
  }, [local, active, target, dropping, progress, scroll.dragging]);

  const finish = (from: number, to: number, success: boolean) => {
    const ids = orderedRef.current.map((item) => item.id);
    const moved = ids[from];
    setLocal(success ? movedOrder(ids, from, to) : ids);
    if (success && moved !== undefined && from !== to) onMove(moved, beforeIdOf(ids, from, to));
  };
  const start = () => {
    haptic.confirm();
    onDragStart?.();
  };

  useFrameCallback((frame) => {
    if (active.value < 0 || dropping.value) return;
    const list = measure(listRef);
    const viewport = measure(scrollRef);
    if (!list || !viewport) return;
    listY.value = list.pageY;
    if (progress.value < 1) return;
    const speed = autoScrollSpeed(
      finger.value,
      viewport.pageY + topInset,
      viewport.pageY + viewport.height - bottomInset,
    );
    const next = Math.max(
      0,
      Math.min(
        Math.max(0, contentHeight.value - viewport.height),
        scrollOffset.value + (speed * Math.min(frame.timeSincePreviousFrame ?? 16, 32)) / 1000,
      ),
    );
    scrollTo(scrollRef, 0, next, false);
    // The measured list origin includes the current scroll offset. Apply this frame's delta too.
    listY.value -= next - scrollOffset.value;
    target.value = indexFromPosition(
      finger.value,
      listY.value,
      0,
      anchor.value,
      headerHeight,
      count,
    );
  });
  useAnimatedReaction(
    () => target.value,
    (current, previous) => {
      if (previous !== null && previous >= 0 && current >= 0 && current !== previous)
        scheduleOnRN(haptic.tick);
    },
  );

  return (
    <Animated.View ref={listRef} collapsable={false}>
      {ordered.map((item, index) => (
        <ReorderItem
          key={item.id}
          index={index}
          drag={drag}
          headerHeight={headerHeight}
          enabled={enabled}
          start={start}
          finish={finish}
          scroll={scroll}
        >
          {renderItem(item, { collapsed: false })}
        </ReorderItem>
      ))}
    </Animated.View>
  );
}

const ReorderItem = memo(function ReorderItem({
  index,
  drag,
  headerHeight,
  children,
  start,
  finish,
  scroll,
  enabled,
}: {
  index: number;
  drag: Drag;
  headerHeight: number;
  children: ReactNode;
  start: () => void;
  finish: (from: number, to: number, success: boolean) => void;
  scroll: Scroll;
  enabled: boolean;
}) {
  const { active, target, progress, finger, anchor, listY, heights, dropping } = drag;
  const rowRef = useAnimatedRef<View>();
  const scrolling = scroll.dragging;
  const height = useSharedValue(headerHeight);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      height.value = event.nativeEvent.layout.height;
      const next = [...heights.value];
      next[index] = event.nativeEvent.layout.height;
      heights.value = next;
    },
    [height, heights, index],
  );
  useLayoutEffect(() => {
    const next = [...heights.value];
    next[index] = height.value;
    heights.value = next;
  }, [height, heights, index]);
  const pan = usePanGesture({
    enabled,
    onBegin: (event) => {
      if (active.value >= 0) GestureStateManager.fail(event.handlerTag);
    },
    activateAfterLongPress: 325,
    onActivate: (event) => {
      const row = measure(rowRef);
      if (!row) return;
      let top = 0;
      for (let i = 0; i < index; i++) top += heights.value[i] ?? headerHeight;
      listY.value = row.pageY - top;
      const grab = event.absoluteY - row.pageY;
      anchor.value = grab;
      // A tall note can be grabbed below the compact header. Slide that grab point into
      // the header with the collapse, rather than leaving the lifted row above the finger.
      if (grab > headerHeight) anchor.value = withTiming(headerHeight / 2, COLLAPSE);
      finger.value = event.absoluteY;
      active.value = index;
      target.value = index;
      scrolling.value = true;
      progress.value = withTiming(1, COLLAPSE);
      scheduleOnRN(start);
    },
    onUpdate: (event) => {
      if (!dropping.value) finger.value = event.absoluteY;
    },
    onDeactivate: (event) => {
      if (active.value !== index) return;
      dropping.value = true;
      const from = index;
      const to = event.canceled ? index : target.value;
      // Keep the visual permutation until React commits the optimistic order.
      finger.value = withTiming(
        listY.value + to * headerHeight + anchor.value,
        COLLAPSE,
        (finished) => {
          if (finished) scheduleOnRN(finish, from, to, !event.canceled);
        },
      );
    },
  });
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    let translateY = 0;
    if (active.value === index) {
      let top = 0;
      for (let i = 0; i < index; i++)
        top += (heights.value[i] ?? headerHeight) * (1 - p) + headerHeight * p;
      translateY = finger.value - listY.value - anchor.value - top;
    } else if (active.value >= 0) {
      translateY = withSpring(
        (slotOf(index, active.value, target.value) - index) * headerHeight,
        SETTLE,
      );
    }
    return {
      overflow: "hidden",
      height: height.value * (1 - p) + Math.min(height.value, headerHeight) * p,
      transform: [{ translateY }],
      zIndex: active.value === index ? 10 : 0,
    };
  });
  return (
    <HeaderGesture value={pan}>
      <Animated.View ref={rowRef} style={style} collapsable={false}>
        <View onLayout={onLayout} style={{ overflow: "hidden" }}>
          {children}
        </View>
      </Animated.View>
    </HeaderGesture>
  );
});
