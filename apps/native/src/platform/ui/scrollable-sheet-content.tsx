import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheet } from "heroui-native";
import { useState, type ComponentProps, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SHEET_SPRING } from "./sheet-motion";

/** Room for the drag handle above the content. */
const HANDLE = 28;
const BODY_PADDING = { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 16 };

/**
 * A bounded sheet: one scrolling body with its actions outside the scroll area, never taller than
 * the screen allows.
 *
 * - `fit` (default) sizes the sheet to its content, so a short confirmation stays short; long
 *   content scrolls inside the cap with the footer still visible.
 * - `tall` opens at a fixed height for content that grows while open (expanding sections).
 */
export function ScrollableSheetContent({
  children,
  footer,
  size = "fit",
  ...props
}: Omit<ComponentProps<typeof BottomSheet.Content>, "children"> & {
  children: ReactNode;
  footer?: ReactNode;
  size?: "fit" | "tall";
}) {
  const { height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const cap = Math.min(560, (height - top) * 0.85);
  const footerView = (
    <View
      className="gap-2 px-4"
      style={{ paddingBottom: bottom + 16 }}
      onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
    >
      {footer}
    </View>
  );

  if (size === "fit" && bodyHeight + footerHeight + HANDLE <= cap) {
    return (
      <BottomSheet.Content
        animationConfigs={SHEET_SPRING}
        backgroundClassName="rounded-t-[20px] bg-overlay"
        {...props}
        topInset={top}
        enableDynamicSizing
        maxDynamicContentSize={cap}
        enableOverDrag={false}
      >
        <View
          style={BODY_PADDING}
          onLayout={(event) => setBodyHeight(event.nativeEvent.layout.height)}
        >
          {children}
        </View>
        {footerView}
      </BottomSheet.Content>
    );
  }

  const sheetHeight =
    size === "tall" || bodyHeight === 0 ? cap : Math.min(cap, bodyHeight + footerHeight + HANDLE);

  return (
    <BottomSheet.Content
      animationConfigs={SHEET_SPRING}
      backgroundClassName="rounded-t-[20px] bg-overlay"
      {...props}
      topInset={top}
      snapPoints={[sheetHeight]}
      enableDynamicSizing={false}
      enableOverDrag={false}
      contentContainerProps={{ style: { height: Math.max(0, sheetHeight - HANDLE) } }}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={BODY_PADDING}
        onContentSizeChange={(_width, measuredHeight) => setBodyHeight(measuredHeight)}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </BottomSheetScrollView>
      {footerView}
    </BottomSheet.Content>
  );
}

/** A fixed sheet whose content is bounded by its visible snap height, including the handle. */
export function FixedSheetContent({
  fraction,
  children,
  ...props
}: Omit<ComponentProps<typeof BottomSheet.Content>, "snapPoints" | "children"> & {
  fraction: number;
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const sheetHeight = Math.max(0, (height - top) * fraction);
  return (
    <BottomSheet.Content
      backgroundClassName="rounded-t-[20px] bg-overlay"
      {...props}
      topInset={top}
      snapPoints={[sheetHeight]}
      enableDynamicSizing={false}
      contentContainerProps={{ style: { height: Math.max(0, sheetHeight - HANDLE) } }}
    >
      {children}
    </BottomSheet.Content>
  );
}
