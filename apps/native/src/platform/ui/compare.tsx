/**
 * Compare: two versions of one picture with a seam the reader drags across it.
 *
 * Source: PanelUI `Compare` (panelui-native 1.4.0, MIT, https://panelui.dev; Copyright (c)
 * PanelUI contributors). The idea and the structure are PanelUI's: the revealed side is a clipped
 * window onto a full-size copy of its content, never a squeezed copy, so both halves always line
 * up. Changes for Vermillion (ADR 0030): restyled to role tokens (`bg-default`, `bg-background`,
 * filled handle, no shadow); haptics through `haptic.tick`; `scheduleOnRN` instead of
 * `runOnJS`; the right-to-left check is `I18nManager.isRTL`; the slot labels are plain `Text`;
 * the vertical orientation and Uniwind/tailwind-variants are dropped; the seam maths is in
 * `compare-math.ts` with tests. Strings (the handle's name) come from props.
 *
 * ```tsx
 * <Compare height={420} handleLabel={t("body__compare_handle")}>
 *   <Compare.After><Image style={fill} /></Compare.After>
 *   <Compare.Before><Image style={fill} /></Compare.Before>
 *   <Compare.Handle />
 * </Compare>
 * ```
 *
 * The whole frame is the drag target and the gesture claims horizontal movement only, so a
 * Compare inside a scrolling page still scrolls. The seam is also `adjustable` for screen
 * readers, and `value` drives it from outside (a button that snaps it to an end).
 */
import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  I18nManager,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";

import { clampRatio, ratioAfterDrag, seamPercent } from "./compare-math";

/** How tall the frame is when the caller does not say. */
const DEFAULT_HEIGHT = 240;
/** The knob's diameter, and so the width of the column the seam lives in. */
const KNOB = 36;
/** How far a screen reader's increment moves the seam, as a share of the frame. */
const STEP = 0.05;
/** Movement along the axis before the drag is the gesture's rather than a scroll's. */
const CLAIM = 8;
/** And movement across it that hands the gesture back. */
const YIELD = 16;

type CompareContextValue = {
  /** Where the seam is, 0 to 1 of the frame, on the UI thread. */
  ratio: SharedValue<number>;
  /** The measured frame. Nothing is drawn until both are above zero. */
  width: number;
  height: number;
  /** True where the frame reads right to left: the window and the seam anchor to the right. */
  mirrored: boolean;
  nudge: (delta: number) => void;
  handleLabel: string;
};

const CompareContext = createContext<CompareContextValue | null>(null);

function useCompare(part: string): CompareContextValue {
  const context = useContext(CompareContext);
  if (!context) throw new Error(`${part} must be used within a <Compare>`);
  return context;
}

type Layer = "base" | "clip" | "over";

export function Compare({
  height = DEFAULT_HEIGHT,
  value,
  defaultValue = 0.5,
  onValueCommit,
  handleLabel,
  children,
}: {
  /** Frame height in points: both sides are positioned absolutely, so this gives the box one. */
  height?: number;
  /** Controlled seam position, 0 to 1. Leave unset to let the frame track it. */
  value?: number;
  defaultValue?: number;
  /** Fires once when the finger lifts or a screen reader moves the seam. */
  onValueCommit?: (value: number) => void;
  /** Spoken name of the seam. */
  handleLabel: string;
  children?: ReactNode;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const mirrored = I18nManager.isRTL;
  const direction = mirrored ? -1 : 1;
  const ratio = useSharedValue(clampRatio(value ?? defaultValue));
  const dragging = useSharedValue(false);
  const start = useSharedValue(0);
  const atEdge = useSharedValue(false);

  // A controlled value owns the seam except while a finger is on it.
  useEffect(() => {
    if (value !== undefined && !dragging.value) ratio.value = clampRatio(value);
  }, [value, ratio, dragging]);

  const commit = useCallback((next: number) => onValueCommit?.(next), [onValueCommit]);
  const nudge = useCallback(
    (delta: number) => {
      const next = clampRatio(ratio.value + delta);
      ratio.value = next;
      commit(next);
    },
    [ratio, commit],
  );

  const extent = box.width;
  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = ratio.value;
      dragging.value = true;
      atEdge.value = ratio.value <= 0 || ratio.value >= 1;
    })
    .onUpdate((event) => {
      const next = ratioAfterDrag(start.value, event.translationX, extent, direction);
      ratio.value = next;
      // The one moment worth feeling: arriving at an end, where the seam stops following.
      const ended = next <= 0 || next >= 1;
      if (ended !== atEdge.value) {
        atEdge.value = ended;
        if (ended) scheduleOnRN(haptic.tick);
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      scheduleOnRN(commit, ratio.value);
    })
    .activeOffsetX([-CLAIM, CLAIM])
    .failOffsetY([-YIELD, YIELD]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    const next = { width: Math.round(w), height: Math.round(h) };
    if (next.width !== box.width || next.height !== box.height) setBox(next);
  };

  const context = useMemo<CompareContextValue>(
    () => ({ ratio, width: box.width, height: box.height, mirrored, nudge, handleLabel }),
    [ratio, box.width, box.height, mirrored, nudge, handleLabel],
  );

  // The background side is drawn first whatever order the children came in: the revealed side is
  // a window laid over it.
  const layers: Record<Layer, ReactNode[]> = { base: [], clip: [], over: [] };
  Children.forEach(children, (child, index) => {
    if (!isValidElement(child)) return;
    // SAFETY: the parts of this file carry a static `layer`; any other element is an overlay.
    const layer = (child.type as { layer?: Layer }).layer ?? "over";
    layers[layer].push(<Fragment key={index}>{child}</Fragment>);
  });

  return (
    <CompareContext.Provider value={context}>
      <GestureDetector gesture={pan}>
        <View
          onLayout={onLayout}
          style={{ height }}
          className="w-full overflow-hidden rounded-xl bg-default"
        >
          {box.width > 0 && box.height > 0 ? (
            <>
              {layers.base}
              {layers.clip}
              {layers.over}
            </>
          ) : null}
        </View>
      </GestureDetector>
    </CompareContext.Provider>
  );
}

/**
 * The side the seam uncovers as it travels: the whole frame, underneath. Drawn at full size and
 * never clipped, so it decides what the frame looks like at either end of the travel.
 */
function CompareAfter({ children }: { children?: ReactNode }) {
  const { width, height } = useCompare("Compare.After");
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height }}>
      {children}
    </View>
  );
}
CompareAfter.layer = "base" satisfies Layer;

/**
 * The side on the near edge of the seam: a window onto the content, sized to the frame. The child
 * gets the frame's measured size in points, not a percentage of the window (which shrinks as the
 * seam closes), so the picture stands still behind the seam instead of sliding under it.
 */
function CompareBefore({ children }: { children?: ReactNode }) {
  const { ratio, width, height, mirrored } = useCompare("Compare.Before");
  // The window opens from the edge the seam starts at; the copy inside is pinned to the same
  // edge, or the content would slide along under the seam.
  const anchor = mirrored ? "right" : "left";
  const clip = useAnimatedStyle(() => ({ width: ratio.value * width, height }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", [anchor]: 0, top: 0, overflow: "hidden" }, clip]}
    >
      <View style={{ position: "absolute", [anchor]: 0, top: 0, width, height }}>{children}</View>
    </Animated.View>
  );
}
CompareBefore.layer = "clip" satisfies Layer;

/**
 * The seam: a line across the frame with a knob on it. The knob only says where the seam is; the
 * drag is on the whole frame. It is the control a screen reader adjusts.
 */
function CompareHandle() {
  const { ratio, width, mirrored, nudge, handleLabel } = useCompare("Compare.Handle");
  const anchor = mirrored ? "right" : "left";
  const towards = mirrored ? -1 : 1;
  const offset = useDerivedValue(() => ratio.value * width);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (offset.value - KNOB / 2) * towards }],
  }));

  const [now, setNow] = useState(() => seamPercent(ratio.value));
  // The spoken value only has to be right when a screen reader reads it.
  useAnimatedReaction(
    () => seamPercent(ratio.value),
    (percent, previous) => {
      if (percent !== previous) scheduleOnRN(setNow, percent);
    },
  );

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") nudge(STEP);
    else if (event.nativeEvent.actionName === "decrement") nudge(-STEP);
  };

  return (
    <Animated.View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={handleLabel}
      accessibilityValue={{ min: 0, max: 100, now }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={onAccessibilityAction}
      pointerEvents="box-none"
      style={[{ position: "absolute", top: 0, bottom: 0, width: KNOB, [anchor]: 0 }, animatedStyle]}
      className="items-center justify-center"
    >
      <View pointerEvents="none" className="absolute h-full bg-background" style={{ width: 2 }} />
      <View
        pointerEvents="none"
        style={{ width: KNOB, height: KNOB }}
        className="items-center justify-center rounded-full bg-background"
      >
        <View className="flex-row gap-1">
          <View className="h-3.5 w-1 rounded-full bg-foreground/60" />
          <View className="h-3.5 w-1 rounded-full bg-foreground/60" />
        </View>
      </View>
    </Animated.View>
  );
}
CompareHandle.layer = "over" satisfies Layer;

/** A caption pinned to a top corner, saying which side is which (here, which date). */
function CompareLabel({ side = "start", children }: { side?: "start" | "end"; children: string }) {
  const { mirrored } = useCompare("Compare.Label");
  const start = mirrored ? side !== "start" : side === "start";
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 8, ...(start ? { left: 8 } : { right: 8 }) }}
      className="rounded-md bg-background/80 px-2 py-1"
    >
      <Text numberOfLines={1} className="text-caption font-medium text-foreground">
        {children}
      </Text>
    </View>
  );
}
CompareLabel.layer = "over" satisfies Layer;

Compare.Before = CompareBefore;
Compare.After = CompareAfter;
Compare.Handle = CompareHandle;
Compare.Label = CompareLabel;
