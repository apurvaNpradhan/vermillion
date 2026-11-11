/** The toast on screen, if any. */
type Shown = { id: string; label: string };

/** What to do with a toast that is about to be shown. */
export type ToastDecision =
  /** Show it; hide `replace` first when something else is still on screen. */
  | { action: "show"; replace: string | null }
  /** The same message is already on screen: show nothing. */
  | { action: "skip" };

/**
 * Keeps toasts calm: one at a time, and an identical message never stacks. A toast with an
 * action (Undo) always replaces what is showing, since its action belongs to the newest change.
 */
export function createToastGate() {
  let current: Shown | null = null;
  return {
    decide(label: string, hasAction: boolean): ToastDecision {
      if (current && current.label === label && !hasAction) return { action: "skip" };
      return { action: "show", replace: current?.id ?? null };
    },
    shown(id: string, label: string) {
      current = { id, label };
    },
    /** Called when a toast goes away; ignores one that was already replaced. */
    hidden(id: string) {
      if (current?.id === id) current = null;
    },
  };
}
