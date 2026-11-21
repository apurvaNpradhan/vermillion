import { useEffect, useRef } from "react";
import {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const FADE = { duration: 120, reduceMotion: ReduceMotion.System };

/** Animate explicit edits without replaying them when the exercise opens or sync changes the grid. */
export function useSetRowMotion(
  setId: string,
  added: boolean,
  onAddedShown: (setId: string) => void,
  onRemove: (setId: string) => Promise<boolean>,
) {
  const opacity = useSharedValue(1);
  const removing = useSharedValue(false);
  const removalPending = useRef(false);

  useEffect(() => {
    if (!added) return;
    opacity.set(0.6);
    opacity.set(withTiming(1, FADE));
    onAddedShown(setId);
  }, [added, onAddedShown, opacity, setId]);

  const remove = () => {
    if (removalPending.current) return;
    removalPending.current = true;
    removing.set(true);
    void onRemove(setId).then((removed) => {
      if (removed) return;
      removalPending.current = false;
      removing.set(false);
    });
  };
  const exiting = () => {
    "worklet";
    return removing.get()
      ? { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, FADE) } }
      : { initialValues: {}, animations: {} };
  };
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return { remove, exiting, style };
}
