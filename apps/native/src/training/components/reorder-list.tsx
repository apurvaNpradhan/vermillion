import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";

import { COLLAPSED_ROW_HEIGHT, beforeIdOf, movedOrder, slotOf, targetIndex } from "../reorder";

/** Hold this long before a row lifts. */
const HOLD_MS = 350;
/** Near-critically damped, no overshoot: the same feel as the sheets. */
const SETTLE = {
  damping: 39,
  stiffness: 600,
  mass: 0.7,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;

type Layout = { y: number; height: number };

/**
 * A list that reorders by long press. Holding a row lifts it; every row then collapses to one
 * line (`collapsed` is passed to `renderItem`), the others make room as the finger passes them,
 * a tick sounds on each crossing, and letting go calls `onMove` with the id the row now sits
 * before (`null` = last). The new order shows at once, before the database echoes it back.
 * Reduce Motion drops the lift and the sliding.
 *
 * One gesture covers the whole list, so the finger position is in list coordinates whatever the
 * scroll offset; rows are measured while expanded to find the one under the finger.
 */
export function ReorderList<T extends { id: string }>({
  items,
  renderItem,
  onMove,
  onDraggingChange,
  handleSide = "left",
}: {
  handleSide?: "left" | "right";
  items: readonly T[];
  renderItem: (item: T, state: { collapsed: boolean }) => ReactNode;
  onMove: (id: string, beforeId: string | null) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState<string[] | null>(null);
  const layouts = useRef(new Map<string, Layout>());

  const incomingOrder = items.map((item) => item.id).join("|");
  useEffect(() => setLocal(null), [incomingOrder]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = (local ?? items.map((item) => item.id)).flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });

  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const fingerY = useSharedValue(0);
  const count = useSharedValue(ordered.length);
  useEffect(() => {
    count.value = ordered.length;
  }, [count, ordered.length]);

  const orderedRef = useRef(ordered);
  useEffect(() => {
    orderedRef.current = ordered;
  });

  const begin = (y: number) => {
    const list = orderedRef.current;
    const index = list.findIndex((item) => {
      const layout = layouts.current.get(item.id);
      return layout !== undefined && y >= layout.y && y < layout.y + layout.height;
    });
    if (index < 0) return;
    fingerY.value = y;
    active.value = index;
    target.value = index;
    setDragging(true);
    onDraggingChange?.(true);
    haptic.confirm();
  };
  const finish = () => {
    const from = active.value;
    const to = target.value;
    if (from < 0) return;
    const ids = orderedRef.current.map((item) => item.id);
    const moved = ids[from];
    active.value = -1;
    target.value = -1;
    setDragging(false);
    onDraggingChange?.(false);
    if (moved !== undefined && to >= 0 && to !== from) {
      setLocal(movedOrder(ids, from, to));
      onMove(moved, beforeIdOf(ids, from, to));
    }
  };

  const pan = usePanGesture({
    // Only the visible grip starts a drag; holding a field must keep editing the field.
    hitSlop: handleSide === "left" ? { left: 0, width: 36 } : { right: 48, width: 24 },
    activateAfterLongPress: HOLD_MS,
    onActivate: (event) => {
      scheduleOnRN(begin, event.y);
    },
    onUpdate: (event) => {
      if (active.value < 0) return;
      fingerY.value = event.y;
      target.value = targetIndex(event.y, COLLAPSED_ROW_HEIGHT, count.value);
    },
    onFinalize: () => {
      scheduleOnRN(finish);
    },
  });

  useAnimatedReaction(
    () => target.value,
    (current, previous) => {
      if (previous !== null && previous >= 0 && current >= 0 && current !== previous) {
        scheduleOnRN(haptic.tick);
      }
    },
  );

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false}>
        {ordered.map((item, index) => (
          <ReorderItem
            key={item.id}
            index={index}
            collapsed={dragging}
            active={active}
            target={target}
            fingerY={fingerY}
            reduced={reduced}
            onLayout={(layout) => {
              if (!dragging) layouts.current.set(item.id, layout);
            }}
          >
            {renderItem(item, { collapsed: dragging })}
          </ReorderItem>
        ))}
      </View>
    </GestureDetector>
  );
}

function ReorderItem({
  index,
  collapsed,
  active,
  target,
  fingerY,
  reduced,
  onLayout,
  children,
}: {
  index: number;
  collapsed: boolean;
  active: SharedValue<number>;
  target: SharedValue<number>;
  fingerY: SharedValue<number>;
  reduced: boolean;
  onLayout: (layout: Layout) => void;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    if (active.value < 0) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };
    }
    if (index === active.value) {
      const lifted = fingerY.value - COLLAPSED_ROW_HEIGHT / 2 - index * COLLAPSED_ROW_HEIGHT;
      return { transform: [{ translateY: lifted }, { scale: reduced ? 1 : 1.02 }], zIndex: 10 };
    }
    const shift = (slotOf(index, active.value, target.value) - index) * COLLAPSED_ROW_HEIGHT;
    return {
      transform: [{ translateY: reduced ? shift : withSpring(shift, SETTLE) }, { scale: 1 }],
      zIndex: 0,
    };
  });
  return (
    <Animated.View
      onLayout={(event) => onLayout(event.nativeEvent.layout)}
      style={[collapsed ? { height: COLLAPSED_ROW_HEIGHT, overflow: "hidden" } : null, style]}
    >
      {children}
    </Animated.View>
  );
}
