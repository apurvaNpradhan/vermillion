import { DotsSixVertical } from "phosphor-react-native";
import { memo, useLayoutEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Modal, Text, View, type ScrollView } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  GestureStateManager,
  usePanGesture,
} from "react-native-gesture-handler";
import Animated, {
  clamp,
  measure,
  ReduceMotion,
  scrollTo,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";

import { autoScrollSpeed, beforeIdOf, indexFromPosition, movedOrder, slotOf } from "./reorder";

/** Every row of the Reorder view is exactly this tall, so a row's place is `index × ROW_HEIGHT`. */
export const ROW_HEIGHT = 60;
const HOLD = 150;
// SAFETY: Reanimated accepts this literal animation configuration.
const SETTLE = {
  damping: 39,
  stiffness: 600,
  mass: 0.7,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;
// SAFETY: Reanimated accepts this literal animation configuration.
const DROP = { duration: 160, reduceMotion: ReduceMotion.System } as const;

type Drag = {
  active: SharedValue<number>;
  target: SharedValue<number>;
  finger: SharedValue<number>;
  grab: SharedValue<number>;
  viewportTop: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  dropping: SharedValue<boolean>;
  dropTop: SharedValue<number>;
  scrolling: SharedValue<boolean>;
  offset: SharedValue<number>;
};

/**
 * A full-screen list of every item as one fixed-height row, to put them in order. Hold a row and
 * drag it (the list scrolls at its edges); the screen's data is written once, on drop, through
 * `onMove(id, beforeId)`. Each row also offers Move up / Move down as accessibility actions.
 * Nothing else is shown: no sets, notes or sheets.
 */
export function ReorderView<T extends { id: string }>({
  visible,
  onClose,
  items,
  onMove,
  renderRow,
  labelOf,
}: {
  visible: boolean;
  onClose: () => void;
  items: readonly T[];
  onMove: (id: string, beforeId: string | null) => void;
  /** The row's content: it fills the row, never taller than `ROW_HEIGHT`. */
  renderRow: (item: T) => ReactNode;
  /** What a screen reader says for the row. */
  labelOf: (item: T) => string;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ReorderContent
          items={items}
          onMove={onMove}
          onClose={onClose}
          renderRow={renderRow}
          labelOf={labelOf}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

function ReorderContent<T extends { id: string }>({
  items,
  onMove,
  onClose,
  renderRow,
  labelOf,
}: {
  items: readonly T[];
  onMove: (id: string, beforeId: string | null) => void;
  onClose: () => void;
  renderRow: (item: T) => ReactNode;
  labelOf: (item: T) => string;
}) {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const incoming = items.map((item) => item.id);
  const [order, setOrder] = useState(incoming);
  // Our own order governs while the view is open; a different set of items is authoritative.
  const known = new Set(incoming);
  const ids =
    order.length === incoming.length && order.every((id) => known.has(id)) ? order : incoming;
  const byId = new Map(items.map((item) => [item.id, item]));
  const count = ids.length;
  const padBottom = bottom + 24;

  const scrollRef = useAnimatedRef<ScrollView>();
  const offset = useScrollOffset(scrollRef);
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const finger = useSharedValue(0);
  const grab = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const dropping = useSharedValue(false);
  const dropTop = useSharedValue(0);
  const scrolling = useSharedValue(false);
  const drag: Drag = {
    active,
    target,
    finger,
    grab,
    viewportTop,
    viewportHeight,
    dropping,
    dropTop,
    scrolling,
    offset,
  };
  const scrollProps = useAnimatedProps(() => ({ scrollEnabled: !scrolling.value }));

  // The drop animation has landed and React holds the new order: let the rows follow their index.
  useLayoutEffect(() => {
    if (!dropping.value) return;
    active.value = -1;
    target.value = -1;
    dropping.value = false;
    scrolling.value = false;
  }, [order, active, target, dropping, scrolling]);

  const move = (from: number, to: number) => {
    const moved = ids[from];
    setOrder(movedOrder(ids, from, to));
    if (moved !== undefined && from !== to) onMove(moved, beforeIdOf(ids, from, to));
  };
  const moveBy = (from: number, step: number) => {
    const to = from + step;
    if (to < 0 || to >= count) return;
    move(from, to);
    AccessibilityInfo.announceForAccessibility(
      t("training__reorder_moved", { position: to + 1, count }),
    );
  };

  useFrameCallback((frame) => {
    if (active.value < 0 || dropping.value) return;
    const speed = autoScrollSpeed(
      finger.value,
      viewportTop.value,
      viewportTop.value + viewportHeight.value,
    );
    const limit = Math.max(0, count * ROW_HEIGHT + padBottom - viewportHeight.value);
    const next = clamp(
      offset.value + (speed * Math.min(frame.timeSincePreviousFrame ?? 16, 32)) / 1000,
      0,
      limit,
    );
    if (next !== offset.value) scrollTo(scrollRef, 0, next, false);
    target.value = indexFromPosition(
      finger.value,
      viewportTop.value,
      next,
      grab.value,
      ROW_HEIGHT,
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
    <View className="flex-1 bg-background" style={{ paddingTop: top }}>
      <View className="h-16 flex-row items-center justify-between pl-4 pr-3">
        <Text accessibilityRole="header" className="text-title-lg font-semibold text-foreground">
          {t("training__reorder")}
        </Text>
        <Button variant="primary" size="sm" className="h-11 px-5" onPress={onClose}>
          <Button.Label>{t("training__reorder_done")}</Button.Label>
        </Button>
      </View>
      <Animated.ScrollView
        ref={scrollRef}
        className="flex-1"
        animatedProps={scrollProps}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: padBottom }}
      >
        <View style={{ height: count * ROW_HEIGHT }}>
          {ids.map((id, index) => {
            const item = byId.get(id);
            return item ? (
              <ReorderRow
                key={id}
                index={index}
                count={count}
                drag={drag}
                scrollRef={scrollRef}
                label={t("training__reorder_row", {
                  title: labelOf(item),
                  position: index + 1,
                  count,
                })}
                onDrop={move}
                onStep={moveBy}
              >
                {renderRow(item)}
              </ReorderRow>
            ) : null;
          })}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const ReorderRow = memo(function ReorderRow({
  index,
  count,
  drag,
  scrollRef,
  label,
  onDrop,
  onStep,
  children,
}: {
  index: number;
  count: number;
  drag: Drag;
  scrollRef: AnimatedRef<ScrollView>;
  label: string;
  onDrop: (from: number, to: number) => void;
  onStep: (from: number, step: number) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const {
    active,
    target,
    finger,
    grab,
    viewportTop,
    viewportHeight,
    dropping,
    dropTop,
    scrolling,
    offset,
  } = drag;
  const pan = usePanGesture({
    activateAfterLongPress: HOLD,
    onBegin: (event) => {
      if (active.value >= 0) GestureStateManager.fail(event.handlerTag);
    },
    onActivate: (event) => {
      const viewport = measure(scrollRef);
      if (!viewport) return;
      viewportTop.value = viewport.pageY;
      viewportHeight.value = viewport.height;
      grab.value = event.absoluteY - viewport.pageY + offset.value - index * ROW_HEIGHT;
      finger.value = event.absoluteY;
      active.value = index;
      target.value = index;
      scrolling.value = true;
      scheduleOnRN(haptic.confirm);
    },
    onUpdate: (event) => {
      if (!dropping.value) finger.value = event.absoluteY;
    },
    onDeactivate: (event) => {
      if (active.value !== index) return;
      const to = event.canceled ? index : target.value;
      dropTop.value = clamp(
        finger.value - viewportTop.value + offset.value - grab.value,
        0,
        (count - 1) * ROW_HEIGHT,
      );
      dropping.value = true;
      dropTop.value = withTiming(to * ROW_HEIGHT, DROP, (finished) => {
        if (finished) scheduleOnRN(onDrop, index, to);
      });
    },
  });
  const style = useAnimatedStyle(() => {
    const mine = active.value === index;
    let y = index * ROW_HEIGHT;
    if (mine) {
      y = dropping.value
        ? dropTop.value
        : clamp(
            finger.value - viewportTop.value + offset.value - grab.value,
            0,
            (count - 1) * ROW_HEIGHT,
          );
    } else if (active.value >= 0) {
      y = withSpring(slotOf(index, active.value, target.value) * ROW_HEIGHT, SETTLE);
    }
    return {
      transform: [{ translateY: y }, { scale: mine ? withTiming(1.02, DROP) : 1 }],
      zIndex: mine ? 10 : 0,
    };
  });
  const tint = useAnimatedStyle(() => ({
    opacity: withTiming(active.value === index ? 1 : 0, DROP),
  }));

  return (
    <Animated.View
      style={[{ position: "absolute", left: 0, right: 0, top: 0, height: ROW_HEIGHT }, style]}
    >
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityLabel={label}
          accessibilityHint={t("training__reorder_hint")}
          accessibilityActions={[
            { name: "decrement", label: t("training__move_up") },
            { name: "increment", label: t("training__move_down") },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "decrement") onStep(index, -1);
            if (event.nativeEvent.actionName === "increment") onStep(index, 1);
          }}
          className="mx-4 my-0.5 flex-1 flex-row items-center overflow-hidden rounded-xl bg-surface"
          collapsable={false}
        >
          <View className="min-w-0 flex-1">{children}</View>
          <View className="h-full w-12 items-center justify-center">
            <DotsSixVertical size={22} color={subtle} />
          </View>
          <Animated.View
            pointerEvents="none"
            className="absolute inset-0 bg-foreground/10"
            style={tint}
          />
        </View>
      </GestureDetector>
    </Animated.View>
  );
});
