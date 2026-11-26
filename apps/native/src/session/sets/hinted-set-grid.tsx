import { memo, useMemo, type ComponentProps } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Hint } from "@/platform/ui/hint";
import { useHint } from "@/platform/ui/use-hint";

import { SetGrid } from "./set-grid";

/**
 * The first exercise's sets with the once-only set-row hint above them. The hint is read here, once
 * for the screen, not per row; the first tick, set-number tap or swipe (remove) closes it, by
 * wrapping those handlers only while the hint is showing. Closed, the handlers pass through
 * unchanged, so the rows never redraw for it.
 */
export const HintedSetGrid = memo(function HintedSetGrid(props: ComponentProps<typeof SetGrid>) {
  const { t } = useTranslation();
  const hint = useHint("set-row");
  const { handlers } = props;
  const { visible, dismiss } = hint;
  const wrapped = useMemo(
    () =>
      visible
        ? {
            ...handlers,
            onTick: (setId: string) => {
              dismiss();
              handlers.onTick(setId);
            },
            onKind: (setId: string) => {
              dismiss();
              handlers.onKind(setId);
            },
            onLimits: (setId: string) => {
              dismiss();
              handlers.onLimits(setId);
            },
            onCopySets: (setId: string, mode: "previous" | "remaining") => {
              dismiss();
              handlers.onCopySets(setId, mode);
            },
            onRemoveSet: (setId: string) => {
              dismiss();
              return handlers.onRemoveSet(setId);
            },
          }
        : handlers,
    [visible, dismiss, handlers],
  );
  return (
    <View className="gap-3">
      {visible ? <Hint text={t("hint__set_row")} onDismiss={dismiss} /> : null}
      <SetGrid {...props} handlers={wrapped} />
    </View>
  );
});
