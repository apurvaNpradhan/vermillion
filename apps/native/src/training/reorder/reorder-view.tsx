import { supersetPlaces, type SupersetItem, type SupersetPlace } from "@workspace/shared";
import { DotsSixVertical } from "phosphor-react-native";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  useDerivedValue,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { useReduceMotion } from "@/platform/ui/use-reduce-motion";

import { autoScrollSpeed, indexFromPosition, previewMove, reconcileOrder, slotOf } from "./reorder";

/** Every row of the Reorder view is exactly this tall, so a row's place is `index × ROW_HEIGHT`. */
export const ROW_HEIGHT = 60;
const HOLD = 150;
const SETTLE = {
  damping: 39,
  stiffness: 600,
  mass: 0.7,
  overshootClamping: true,
};
const DROP = { duration: 160 };

type LiftedRow = {
  id: string;
  index: number;
  token: number;
  top: SharedValue<number | null>;
};
type Drag = {
  active: SharedValue<LiftedRow | null>;
  sequence: SharedValue<number>;
  target: SharedValue<number>;
  finger: SharedValue<number>;
  grab: SharedValue<number>;
  viewportTop: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  dragging: SharedValue<boolean>;
  offset: SharedValue<number>;
};

function resetDrag(drag: Drag, token?: number) {
  "worklet";
  const row = drag.active.value;
  if (token !== undefined && row?.token !== token) return;
  drag.active.value = null;
  drag.target.value = -1;
  drag.dragging.value = false;
  if (row) row.top.value = null;
}

type ReorderItem = { id: string; supersetGroup?: string | null; restSeconds?: number | null };
type ContentProps<T extends ReorderItem> = {
  items: readonly T[];
  onClose: () => void;
  onMove: (id: string, beforeId: string | null) => Promise<boolean>;
  renderRow: (item: T, index: number, place: SupersetPlace) => ReactNode;
  labelOf: (item: T) => string;
};

/** A fixed-height list with touch and accessibility actions that write the order on drop. */
export function ReorderView<T extends ReorderItem>({
  visible,
  motion = true,
  ...props
}: ContentProps<T> & { visible: boolean; motion?: boolean }) {
  const systemReduced = useReduceMotion();
  const reduced = !motion || systemReduced;
  const close = useRef<(() => void) | null>(null);
  // A different set of rows invalidates gestures and queued callbacks for the old list.
  const membership = visible ? JSON.stringify(props.items.map((item) => item.id).sort()) : "";
  return (
    <Modal
      visible={visible}
      animationType={reduced ? "none" : "slide"}
      onRequestClose={() => (close.current ?? props.onClose)()}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {visible ? (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ReorderContent key={membership} {...props} reduced={reduced} close={close} />
        </GestureHandlerRootView>
      ) : null}
    </Modal>
  );
}

function ReorderContent<T extends ReorderItem>({
  items,
  onMove,
  onClose,
  renderRow,
  labelOf,
  reduced,
  close,
}: ContentProps<T> & { reduced: boolean; close: { current: (() => void) | null } }) {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const incoming: SupersetItem[] = items.map((item) => ({
    id: item.id,
    superset_group: item.supersetGroup ?? null,
    rest_seconds: item.restSeconds ?? null,
  }));
  const [preview, setPreview] = useState<Parameters<typeof reconcileOrder>[1]>(null);
  const [held, setHeld] = useState<readonly SupersetItem[] | null>(null);
  const [released, setReleased] = useState<number | null>(null);
  const available = reconcileOrder(incoming, preview);
  const orderKey = JSON.stringify(available.map((row) => row.id));
  const rows = held ?? available;
  const places = supersetPlaces(rows, (row) => row.superset_group);
  const byId = new Map(items.map((item) => [item.id, item]));
  const count = rows.length;
  const padBottom = bottom + 24;

  const scrollRef = useAnimatedRef<ScrollView>();
  const offset = useScrollOffset(scrollRef);
  const active = useSharedValue<LiftedRow | null>(null);
  const sequence = useSharedValue(0);
  const target = useSharedValue(-1);
  const finger = useSharedValue(0);
  const grab = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const dragging = useSharedValue(false);
  const drag = useMemo<Drag>(
    () => ({
      active,
      sequence,
      target,
      finger,
      grab,
      viewportTop,
      viewportHeight,
      dragging,
      offset,
    }),
    [active, sequence, target, finger, grab, viewportTop, viewportHeight, dragging, offset],
  );
  const scrollProps = useAnimatedProps(() => ({ scrollEnabled: !dragging.value }));

  // The worklet can call back after a sync update. Consult the latest committed list on JS.
  const latest = useRef<{
    incoming: typeof incoming;
    available: typeof available;
    orderKey: string;
    onMove: typeof onMove;
    onClose: typeof onClose;
  } | null>(null);
  const lift = useRef<{ token: number; orderKey: string } | null>(null);
  const writing = useRef(false);
  useLayoutEffect(() => {
    latest.current = { incoming, available, orderKey, onMove, onClose };
    if (preview && available !== preview.rows) setPreview(null);
  });
  useLayoutEffect(() => {
    const reset = () => {
      latest.current = null;
      scheduleOnUI(resetDrag, drag);
    };
    close.current = () => {
      const dismiss = latest.current?.onClose;
      reset();
      dismiss?.();
    };
    return () => {
      reset();
      close.current = null;
    };
  }, [close, drag]);
  // Let React place rows in the new order before removing their drag offsets.
  useLayoutEffect(() => {
    if (released !== null) scheduleOnUI(resetDrag, drag, released);
  }, [released, drag]);

  const move = useCallback(async (id: string, to: number, announce?: (count: number) => void) => {
    const current = latest.current;
    if (!current || writing.current) return;
    const next = previewMove(current.available, id, to);
    if (!next) return;

    writing.current = true;
    setPreview({ base: current.incoming, rows: next.rows });
    let saved = false;
    try {
      saved = await current.onMove(id, next.beforeId);
    } catch {
      saved = false;
    } finally {
      writing.current = false;
      if (latest.current && !saved) setPreview(null);
    }
    if (saved && latest.current) announce?.(next.rows.length);
  }, []);

  const onLift = useCallback((token: number, sourceOrder: string) => {
    const current = latest.current;
    if (!current || writing.current || current.orderKey !== sourceOrder) {
      setReleased(token);
      return;
    }
    lift.current = { token, orderKey: sourceOrder };
    setHeld(current.available);
  }, []);
  const onDrop = useCallback(
    (id: string, token: number, to: number) => {
      if (lift.current?.token !== token) return;
      const sourceOrder = lift.current.orderKey;
      lift.current = null;
      setHeld(null);
      setReleased(token);
      if (latest.current?.orderKey === sourceOrder && to >= 0) void move(id, to);
    },
    [move],
  );

  const moveBy = (id: string, step: number) => {
    const current = latest.current;
    if (!current || lift.current) return;
    const from = current.available.findIndex((row) => row.id === id);
    if (from === -1) return;
    const to = from + step;
    void move(id, to, (total) => {
      AccessibilityInfo.announceForAccessibility(
        t("training__reorder_moved", { position: to + 1, count: total }),
      );
    });
  };

  useFrameCallback((frame) => {
    const row = active.value;
    if (!row || !dragging.value) return;
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
    row.top.value = clamp(
      finger.value - viewportTop.value + next - grab.value,
      0,
      (count - 1) * ROW_HEIGHT,
    );
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
        <Button variant="primary" size="sm" className="h-11 px-5" onPress={() => close.current?.()}>
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
          {rows.map(({ id }, index) => {
            const item = byId.get(id);
            return item ? (
              <ReorderRow
                key={id}
                id={id}
                index={index}
                count={count}
                orderKey={orderKey}
                drag={drag}
                reduced={reduced}
                scrollRef={scrollRef}
                label={t("training__reorder_row", {
                  title: labelOf(item),
                  position: index + 1,
                  count,
                })}
                onLift={onLift}
                onDrop={onDrop}
                onStep={moveBy}
              >
                {renderRow(item, index, places[index] ?? "none")}
              </ReorderRow>
            ) : null;
          })}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const ReorderRow = memo(function ReorderRow({
  id,
  index,
  count,
  orderKey,
  drag,
  reduced,
  scrollRef,
  label,
  onLift,
  onDrop,
  onStep,
  children,
}: {
  id: string;
  index: number;
  count: number;
  orderKey: string;
  drag: Drag;
  reduced: boolean;
  scrollRef: AnimatedRef<ScrollView>;
  label: string;
  onLift: (token: number, orderKey: string) => void;
  onDrop: (id: string, token: number, to: number) => void;
  onStep: (id: string, step: number) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const { active, sequence, target, finger, grab, viewportTop, viewportHeight, dragging, offset } =
    drag;
  const liftedTop = useSharedValue<number | null>(null);
  const pan = usePanGesture({
    activateAfterLongPress: HOLD,
    onBegin: (event) => {
      if (active.value !== null) GestureStateManager.fail(event.handlerTag);
    },
    onActivate: (event) => {
      if (active.value !== null) return;
      const viewport = measure(scrollRef);
      if (!viewport) return;
      viewportTop.value = viewport.pageY;
      viewportHeight.value = viewport.height;
      grab.value = event.absoluteY - viewport.pageY + offset.value - index * ROW_HEIGHT;
      finger.value = event.absoluteY;
      const token = sequence.value + 1;
      sequence.value = token;
      liftedTop.value = index * ROW_HEIGHT;
      active.value = { id, index, token, top: liftedTop };
      target.value = index;
      dragging.value = true;
      scheduleOnRN(onLift, token, orderKey);
      scheduleOnRN(haptic.confirm);
    },
    onUpdate: (event) => {
      if (active.value?.id === id && dragging.value) finger.value = event.absoluteY;
    },
    onDeactivate: (event) => {
      const row = active.value;
      if (row?.id !== id) return;
      dragging.value = false;
      const { token } = row;
      const to = event.canceled ? -1 : target.value;
      const settleAt = to < 0 ? row.index : to;
      liftedTop.value = withTiming(
        settleAt * ROW_HEIGHT,
        { ...DROP, reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.System },
        (finished) => {
          if (finished && active.value?.token === token) {
            scheduleOnRN(onDrop, id, token, to);
          }
        },
      );
    },
  });

  // Each row reads its own position. Only the lifted row receives per-frame updates.
  const slot = useDerivedValue(() => {
    const row = active.value;
    return row === null ? index : slotOf(index, row.index, target.value);
  });
  const mine = useDerivedValue(() => active.value?.id === id);
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          liftedTop.value ??
          withSpring(slot.value * ROW_HEIGHT, {
            ...SETTLE,
            reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.System,
          }),
      },
      { scale: !reduced && mine.value ? withTiming(1.02, DROP) : 1 },
    ],
    zIndex: mine.value ? 10 : 0,
  }));
  const tint = useAnimatedStyle(() => ({
    opacity: reduced ? Number(mine.value) : withTiming(Number(mine.value), DROP),
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
            ...(index > 0 ? [{ name: "moveUp", label: t("training__move_up") }] : []),
            ...(index + 1 < count ? [{ name: "moveDown", label: t("training__move_down") }] : []),
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "moveUp" && index > 0) onStep(id, -1);
            if (event.nativeEvent.actionName === "moveDown" && index + 1 < count) onStep(id, 1);
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
