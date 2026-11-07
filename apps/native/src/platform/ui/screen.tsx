import type { ReactNode } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Scrolling, keyboard-aware page container that respects the safe area. */
export function Screen({
  children,
  withTopInset = false,
}: {
  children: ReactNode;
  /** True for screens without a navigation header. */
  withTopInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow gap-4 p-4"
      contentContainerStyle={{ paddingTop: withTopInset ? insets.top + 16 : 16 }}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
