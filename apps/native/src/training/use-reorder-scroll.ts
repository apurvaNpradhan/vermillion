import { ScrollView } from "react-native";
import {
  useAnimatedProps,
  useAnimatedRef,
  useScrollOffset,
  useSharedValue,
} from "react-native-reanimated";

/** Share the existing outer scroll view with the reorder worklets. */
export function useReorderScroll() {
  const ref = useAnimatedRef<ScrollView>();
  const offset = useScrollOffset(ref);
  const dragging = useSharedValue(false);
  const contentHeight = useSharedValue(0);
  const animatedProps = useAnimatedProps(() => ({ scrollEnabled: !dragging.value }));
  const onContentSizeChange = (_width: number, height: number) => {
    contentHeight.value = height;
  };
  return { ref, offset, dragging, contentHeight, animatedProps, onContentSizeChange };
}
