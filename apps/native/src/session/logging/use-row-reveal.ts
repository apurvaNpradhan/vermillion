import { useCallback, useRef, type RefObject } from "react";
import type { FlatList, View } from "react-native";

/**
 * Scrolls a set into view above the keypad while it is being edited. Positions are measured in the
 * window, so it does not matter how deeply a row is nested.
 */
export function useRowReveal<Item>(scrollRef: RefObject<FlatList<Item> | null>) {
  const viewportRef = useRef<View>(null);
  const offset = useRef(0);
  const rows = useRef(new Map<string, View>());

  const registerRow = useCallback(
    (key: string) => (node: View | null) => {
      if (node) rows.current.set(key, node);
      else rows.current.delete(key);
    },
    [],
  );
  const onScroll = useCallback((y: number) => {
    offset.current = y;
  }, []);

  const measure = useCallback(
    (
      key: string,
      then: (
        row: { top: number; bottom: number },
        view: { top: number; bottom: number },
      ) => number | null,
    ) => {
      const row = rows.current.get(key);
      const viewport = viewportRef.current;
      if (!row || !viewport) return;
      viewport.measureInWindow((_vx, vy, _vw, vh) => {
        row.measureInWindow((_rx, ry, _rw, rh) => {
          const delta = then({ top: ry, bottom: ry + rh }, { top: vy, bottom: vy + vh });
          if (delta !== null && delta !== 0) {
            scrollRef.current?.scrollToOffset({
              offset: Math.max(0, offset.current + delta),
              animated: false,
            });
          }
        });
      });
    },
    [],
  );

  /** Moves the row just enough to be fully visible, with a margin. */
  const reveal = useCallback(
    (key: string) =>
      measure(key, (row, view) => {
        if (row.bottom > view.bottom - 12) return row.bottom - view.bottom + 12;
        if (row.top < view.top + 12) return row.top - view.top - 12;
        return null;
      }),
    [measure],
  );

  const hasRow = useCallback((key: string) => rows.current.has(key), []);
  return { viewportRef, registerRow, onScroll, reveal, hasRow };
}

/** Runs `run` after the next two frames, when the layout of the current render is committed. */
export function afterLayout(run: () => void): () => void {
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(run);
  });
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}
