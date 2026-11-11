import { useToast, type ToastShowOptions } from "heroui-native";
import { useMemo } from "react";

import { createToastGate } from "./toast-gate";

/** A toast with a label, as every toast in the app is (no custom component). */
export type AppToastOptions = Exclude<ToastShowOptions, { component: unknown }> & {
  label: string;
};

// One gate for the whole app: toasts from any screen share the one slot.
const gate = createToastGate();
let counter = 0;

/**
 * `useToast` with the app's manners: one toast at a time and identical messages never stack
 * (`toast-gate.ts`). Use this instead of HeroUI's `useToast` everywhere.
 */
export function useAppToast() {
  const { toast } = useToast();
  return useMemo(
    () => ({
      toast: {
        show(config: AppToastOptions): string | null {
          const decision = gate.decide(config.label, config.actionLabel !== undefined);
          if (decision.action === "skip") return null;
          if (decision.replace !== null) toast.hide(decision.replace);
          counter += 1;
          const id = `app-toast-${counter}`;
          gate.shown(id, config.label);
          return toast.show({
            ...config,
            id,
            onHide: () => {
              gate.hidden(id);
              config.onHide?.();
            },
          });
        },
        hide: toast.hide,
      },
    }),
    [toast],
  );
}
