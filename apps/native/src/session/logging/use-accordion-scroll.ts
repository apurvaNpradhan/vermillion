import type { LegendListRef } from "@legendapp/list/react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, type RefObject } from "react";

import type { ScrollRequest, SessionStore } from "@/session/store/session-store";
import { afterLayout } from "./use-row-reveal";

type Reveal = {
  request: ScrollRequest;
  cancelFrame?: () => void;
  scrolling: boolean;
  layoutChanged: boolean;
};

/**
 * Start after the accordion commits. An offscreen exercise can only be estimated until it mounts,
 * so follow up if LegendList measures the target or a preceding row during the scroll.
 */
export function useAccordionScroll(store: SessionStore, list: RefObject<LegendListRef | null>) {
  const reveal = useRef<Reveal | null>(null);
  const cancel = useCallback(() => {
    const active = reveal.current;
    reveal.current = null;
    active?.cancelFrame?.();
    if (active?.scrolling) list.current?.cancelScroll();
  }, [list]);

  const schedule = useCallback(
    function schedule(active: Reveal, animated: boolean) {
      active.cancelFrame?.();
      active.cancelFrame = afterLayout(() => {
        const scroller = list.current;
        if (reveal.current !== active || !scroller) return;
        active.cancelFrame = undefined;
        active.layoutChanged = false;
        active.scrolling = true;
        void scroller.scrollToKey({ key: active.request.exerciseId, animated }).then(() => {
          if (reveal.current !== active) return;
          active.cancelFrame = afterLayout(() => {
            active.scrolling = false;
            if (active.layoutChanged) schedule(active, false);
            else reveal.current = null;
          });
        });
      });
    },
    [list],
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = store.subscribe((state, before) => {
        if (state.cell || state.ui.readOnly || state.session.finishedAt !== null) {
          cancel();
          return;
        }
        if (state.scrollRequest === before.scrollRequest) return;
        cancel();
        if (!state.scrollRequest) return;
        const next = { request: state.scrollRequest, scrolling: false, layoutChanged: false };
        reveal.current = next;
        schedule(next, true);
      });
      return () => {
        unsubscribe();
        cancel();
      };
    }, [store, cancel, schedule]),
  );

  const onItemSizeChanged = useCallback(
    ({ index }: { index: number }) => {
      const active = reveal.current;
      if (!active) return;
      const target = store.getState().exerciseIds.indexOf(active.request.exerciseId);
      if (index <= target) {
        if (active.scrolling) active.layoutChanged = true;
        else schedule(active, true);
      }
    },
    [store, schedule],
  );

  return { onItemSizeChanged, cancel };
}
