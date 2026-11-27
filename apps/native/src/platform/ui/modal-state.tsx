import { BottomSheet, useBottomSheet } from "heroui-native";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * How many dialogs and sheets are presented. iOS hides the screen behind a modal view by itself
 * (`accessibilityViewIsModal`); Android has no such flag, so the app root hides its subtree from
 * TalkBack while this is above zero (see `AppProviders`).
 */
let open = 0;
const listeners = new Set<() => void>();

function change(delta: 1 | -1) {
  open += delta;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Register on open and release on close or unmount, including during navigation. */
function useModalPresence(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    change(1);
    return () => change(-1);
  }, [isOpen]);
}

/** True while any dialog or sheet is presented. */
export function useModalOpen() {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  );
}

/** Dialog portals mount their content only while open. */
export function ModalPresence() {
  useModalPresence(true);
  return null;
}

/** HeroUI keeps closed sheets mounted for layout. Count only open sheets and hide closed ones. */
export function SheetPortal({ children }: { children: ReactNode }) {
  const { isOpen } = useBottomSheet();
  useModalPresence(isOpen);
  return (
    <BottomSheet.Portal unstable_accessibilityContainerViewIsModal={isOpen}>
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        accessibilityViewIsModal={isOpen}
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? "auto" : "no-hide-descendants"}
      >
        {children}
      </View>
    </BottomSheet.Portal>
  );
}
