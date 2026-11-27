import { useEffect, useSyncExternalStore } from "react";

/**
 * How many dialogs and sheets are presented. iOS hides the screen behind a modal view by itself
 * (`accessibilityViewIsModal`); Android has no such flag, so the app root hides its subtree from
 * TalkBack while this is above zero (see `AppProviders`). A dialog or sheet calls
 * {@link useModalPresence} from content that mounts only while it is presented.
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

/** Count the calling component as a presented modal for as long as it is mounted. */
export function useModalPresence() {
  useEffect(() => {
    change(1);
    return () => change(-1);
  }, []);
}

/** True while any dialog or sheet is presented. */
export function useModalOpen() {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  );
}

/** Render inside a dialog's or sheet's content: it counts as presented while it is mounted. */
export function ModalPresence() {
  useModalPresence();
  return null;
}
