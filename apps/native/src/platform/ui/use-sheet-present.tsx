import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

/** After the first layout, for the sheet's own measuring to finish before it is asked to open. */
const SETTLE_MS = 120;

/**
 * For a sheet that is mounted only while it is wanted (`{open ? <Sheet/> : null}`). The bottom
 * sheet presents when `isOpen` changes, so a sheet that mounts with `isOpen` already true never
 * appears, and one asked to open before it has been laid out (a long form, a busy device) stays
 * off-screen with no error. `isOpen` is false until `probe`, a zero-size view placed first in the
 * sheet's content, has been laid out, and true a moment later.
 */
export function useSheetPresent() {
  const [isOpen, setIsOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onLayout = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => setIsOpen(true), SETTLE_MS);
  }, []);
  const probe = (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={{ position: "absolute", width: 0, height: 0 }}
    />
  );
  return { isOpen, probe };
}
