import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheet } from "heroui-native";
import type { ComponentProps, ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SHEET_SPRING } from "./sheet-motion";

/** Bound the sheet itself, with one scrolling body and actions outside the scroll area. */
export function ScrollableSheetContent({
  children,
  footer,
  ...props
}: Omit<ComponentProps<typeof BottomSheet.Content>, "children"> & {
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <BottomSheet.Content
      animationConfigs={SHEET_SPRING}
      backgroundClassName="rounded-t-[28px] bg-overlay"
      {...props}
      topInset={top}
      snapPoints={[Math.min(560, (height - top) * 0.85)]}
      enableDynamicSizing={false}
      enableOverDrag={false}
      contentContainerClassName="h-full"
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 16 }}
      >
        {children}
      </BottomSheetScrollView>
      <View className="gap-2 px-4" style={{ paddingBottom: bottom + 16 }}>
        {footer}
      </View>
    </BottomSheet.Content>
  );
}
