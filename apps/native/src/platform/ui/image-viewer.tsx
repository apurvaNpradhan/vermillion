/**
 * ImageViewer: full-screen pictures with pinch zoom, double-tap zoom, swipe between pages and
 * drag-down to close.
 *
 * Source: PanelUI `ImageViewer` (panelui-native 1.4.0, MIT, https://panelui.dev; Copyright (c)
 * PanelUI contributors). The gesture design is PanelUI's: one surface per page where two fingers
 * zoom about the point between them, one finger on a zoomed picture pans it with a rubber band at
 * the edges, a double tap zooms in and out, and a vertical drag on a picture at rest drags it away
 * while the backdrop fades (letting go on where the drag was heading closes it). The geometry is in
 * `image-viewer-geometry.ts`, tested. Changes for Vermillion (ADR 0030): the trigger registry and
 * the thumbnail-to-screen flight are not ported, because pictures come from our own lists and
 * media is local-first; the viewer is generic over `items` (a key, the picture's size and a
 * caption) and `renderImage`, so it knows nothing of media and Session photos can reuse it; the
 * pages are a native paging `FlatList` inside a `Modal`; the backdrop is the `background` role
 * (no blur, no raw colors); the close button is a Phosphor icon; the strings (close, counter) come
 * from props; `scheduleOnRN` replaces `runOnJS`, the haptic is `haptic.tick`.
 */
import { X } from "phosphor-react-native";
import { useThemeColor } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";

import {
  clamp,
  dragFade,
  dragScale,
  fitContain,
  focalTranslation,
  panBound,
  rubberBandClamp,
  shouldDismiss,
} from "./image-viewer-geometry";

/** One picture of the viewer; the viewer fits it by its size and the caller draws it. */
export type ViewerItem = {
  key: string;
  /** Pixel size of the picture, for fitting and pan limits. 0 fills the screen. */
  width: number;
  height: number;
  /** Read out for the picture and drawn under it. */
  caption?: string;
};

/** What `renderImage` is given: the size the picture is drawn at, in points. */
export type ViewerImageBox = { width: number; height: number };

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** Firm: a zoom or a spring back lands without drifting. */
const SETTLE = { damping: 34, stiffness: 320, mass: 1 } as const;
/** Zoom above this counts as zoomed (the pager stops scrolling, the pan takes over). */
const ZOOMED = 1.01;

function ZoomPage({
  item,
  active,
  viewport,
  fade,
  onZoomChange,
  onDismiss,
  renderImage,
}: {
  item: ViewerItem;
  active: boolean;
  viewport: { width: number; height: number };
  /** Backdrop opacity shared by every page: dragging a picture away lets the page show through. */
  fade: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
  renderImage: (item: ViewerItem, box: ViewerImageBox) => ReactNode;
}) {
  const { width: W, height: H } = viewport;
  const fit = useMemo(() => fitContain(item, viewport), [item, viewport]);
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focalOffsetX = useSharedValue(0);
  const focalOffsetY = useSharedValue(0);
  const lastFocalX = useSharedValue(0);
  const lastFocalY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const shrink = useSharedValue(1);
  const zoomedNow = useSharedValue(false);
  const [zoomed, setZoomed] = useState(false);

  const report = useCallback(
    (next: boolean) => {
      setZoomed(next);
      onZoomChange(next);
    },
    [onZoomChange],
  );

  // A page the reader has left comes back at its fitted size.
  useEffect(() => {
    if (active) return;
    cancelAnimation(scale);
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    zoomedNow.value = false;
    setZoomed(false);
    onZoomChange(false);
  }, [active, scale, tx, ty, zoomedNow, onZoomChange]);

  const settleZoom = () => {
    "worklet";
    const target = clamp(scale.value, 1, MAX_SCALE);
    if (target <= ZOOMED) {
      scale.value = withSpring(1, SETTLE);
      tx.value = withSpring(0, SETTLE);
      ty.value = withSpring(0, SETTLE);
      if (zoomedNow.value) {
        zoomedNow.value = false;
        scheduleOnRN(report, false);
      }
      return;
    }
    const boundX = panBound(fit.width, target, W);
    const boundY = panBound(fit.height, target, H);
    scale.value = withSpring(target, SETTLE);
    tx.value = withSpring(clamp(tx.value, -boundX, boundX), SETTLE);
    ty.value = withSpring(clamp(ty.value, -boundY, boundY), SETTLE);
  };

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      startScale.value = scale.value;
      lastFocalX.value = event.focalX - W / 2;
      lastFocalY.value = event.focalY - H / 2;
      focalOffsetX.value = lastFocalX.value - tx.value;
      focalOffsetY.value = lastFocalY.value - ty.value;
    })
    .onUpdate((event) => {
      const next = rubberBandClamp(startScale.value * event.scale, 1, MAX_SCALE, MAX_SCALE);
      lastFocalX.value = event.focalX - W / 2;
      lastFocalY.value = event.focalY - H / 2;
      scale.value = next;
      tx.value = focalTranslation(lastFocalX.value, focalOffsetX.value, startScale.value, next);
      ty.value = focalTranslation(lastFocalY.value, focalOffsetY.value, startScale.value, next);
      if (next > ZOOMED && !zoomedNow.value) {
        zoomedNow.value = true;
        scheduleOnRN(report, true);
      }
    })
    .onEnd(() => {
      settleZoom();
    });

  // One finger on a zoomed picture pans it, with a rubber band at its edges.
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .maxPointers(1)
    .minDistance(4)
    .onStart(() => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((event) => {
      const boundX = panBound(fit.width, scale.value, W);
      const boundY = panBound(fit.height, scale.value, H);
      tx.value = rubberBandClamp(startX.value + event.translationX, -boundX, boundX, W);
      ty.value = rubberBandClamp(startY.value + event.translationY, -boundY, boundY, H);
    })
    .onEnd(() => {
      const boundX = panBound(fit.width, scale.value, W);
      const boundY = panBound(fit.height, scale.value, H);
      tx.value = withSpring(clamp(tx.value, -boundX, boundX), SETTLE);
      ty.value = withSpring(clamp(ty.value, -boundY, boundY), SETTLE);
    });

  // A vertical drag on a picture at rest drags it away; sideways is left to the pager.
  const dismiss = Gesture.Pan()
    .enabled(!zoomed)
    .maxPointers(1)
    .activeOffsetY([-10, 10])
    .failOffsetX([-12, 12])
    .onStart(() => {
      scheduleOnRN(haptic.tick);
    })
    .onUpdate((event) => {
      dragX.value = event.translationX;
      dragY.value = event.translationY;
      shrink.value = dragScale(event.translationY, H);
      fade.value = dragFade(event.translationY, H);
    })
    .onEnd((event, success) => {
      if (success && shouldDismiss(event.translationY, event.velocityY)) {
        const away = Math.sign(event.translationY || 1) * H * 0.3;
        fade.value = withTiming(0, { duration: 140 });
        dragY.value = withTiming(dragY.value + away, { duration: 140 }, (finished) => {
          if (finished) scheduleOnRN(onDismiss);
        });
        return;
      }
      dragX.value = withSpring(0, SETTLE);
      dragY.value = withSpring(0, SETTLE);
      shrink.value = withSpring(1, SETTLE);
      fade.value = withTiming(1, { duration: 150 });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event, success) => {
      if (!success) return;
      if (scale.value > ZOOMED) {
        scale.value = withSpring(1, SETTLE);
        tx.value = withSpring(0, SETTLE);
        ty.value = withSpring(0, SETTLE);
        zoomedNow.value = false;
        scheduleOnRN(report, false);
        return;
      }
      const focalX = event.x - W / 2;
      const focalY = event.y - H / 2;
      const boundX = panBound(fit.width, DOUBLE_TAP_SCALE, W);
      const boundY = panBound(fit.height, DOUBLE_TAP_SCALE, H);
      scale.value = withSpring(DOUBLE_TAP_SCALE, SETTLE);
      tx.value = withSpring(
        clamp(focalTranslation(focalX, focalX, 1, DOUBLE_TAP_SCALE), -boundX, boundX),
        SETTLE,
      );
      ty.value = withSpring(
        clamp(focalTranslation(focalY, focalY, 1, DOUBLE_TAP_SCALE), -boundY, boundY),
        SETTLE,
      );
      zoomedNow.value = true;
      scheduleOnRN(report, true);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, dismiss, doubleTap);

  const pictureStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value + dragX.value },
      { translateY: ty.value + dragY.value },
      { scale: scale.value * shrink.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: W, height: H }} className="items-center justify-center">
        <Animated.View
          accessible
          accessibilityRole="image"
          accessibilityLabel={item.caption}
          style={[{ width: fit.width, height: fit.height }, pictureStyle]}
        >
          {renderImage(item, fit)}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/**
 * Full-screen viewer over `items`, opened at `index`. It reports page turns through
 * `onIndexChange` and closes through `onClose` (the close button, a drag away, the Android back
 * button). `renderImage` draws a picture at the box it is given and is where the caller decides
 * which variant to show (the full image, with the thumbnail standing in while it loads).
 */
export function ImageViewer({
  items,
  index,
  onIndexChange,
  onClose,
  renderImage,
  closeLabel,
  pageLabel,
}: {
  items: readonly ViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  renderImage: (item: ViewerItem, box: ViewerImageBox) => ReactNode;
  closeLabel: string;
  /** The counter under the top bar, e.g. "2 / 4"; shown when there is more than one picture. */
  pageLabel: (index: number, count: number) => string;
}) {
  const viewport = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const fade = useSharedValue(1);
  const [pagerLocked, setPagerLocked] = useState(false);
  const list = useRef<FlatList<ViewerItem>>(null);
  const count = items.length;
  const page = clamp(index, 0, Math.max(count - 1, 0));
  const size = useMemo(() => ({ width: viewport.width, height: viewport.height }), [viewport]);

  const settled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(viewport.width, 1));
    const bounded = clamp(next, 0, count - 1);
    if (bounded !== page) {
      haptic.tick();
      onIndexChange(bounded);
    }
  };

  // A rotation re-lays the pages out, so the open one is brought back into view.
  useEffect(() => {
    if (count) list.current?.scrollToIndex({ index: page, animated: false });
    if (page !== index) onIndexChange(page);
  }, [viewport.width, page, count, items, index, onIndexChange]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const caption = items[page]?.caption;

  return (
    <Modal transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          pointerEvents="none"
          style={backdropStyle}
          className="absolute inset-0 bg-background"
        />
        <FlatList
          ref={list}
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={!pagerLocked && count > 1}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={page}
          getItemLayout={(_, at) => ({
            length: viewport.width,
            offset: viewport.width * at,
            index: at,
          })}
          keyExtractor={(item) => item.key}
          onMomentumScrollEnd={settled}
          windowSize={3}
          initialNumToRender={1}
          renderItem={({ item, index: at }) => (
            <ZoomPage
              item={item}
              active={at === page}
              viewport={size}
              fade={fade}
              onZoomChange={setPagerLocked}
              onDismiss={onClose}
              renderImage={renderImage}
            />
          )}
        />
        <Animated.View
          pointerEvents="box-none"
          style={[{ position: "absolute", top: top + 8, left: 16, right: 16 }, chromeStyle]}
          className="flex-row items-center justify-between"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            hitSlop={8}
            className="size-11 items-center justify-center rounded-full bg-surface active:bg-default"
          >
            <X size={20} color={foreground} />
          </Pressable>
          {count > 1 ? (
            <View className="rounded-full bg-surface px-3 py-2">
              <Text className="font-normal text-label tabular-nums text-foreground">
                {pageLabel(page, count)}
              </Text>
            </View>
          ) : null}
        </Animated.View>
        {caption ? (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", bottom: bottom + 16, left: 16, right: 16 },
              chromeStyle,
            ]}
            className="items-center"
          >
            <Text className="font-normal rounded-full bg-surface px-3 py-2 text-label text-foreground">
              {caption}
            </Text>
          </Animated.View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
