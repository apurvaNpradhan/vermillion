import { useForm, useStore } from "@tanstack/react-form";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Text } from "react-native";
import { changedCanonical, cmToIn, formatBodyValue, inToCm } from "@workspace/shared";
import { usePreference, usePreferences } from "@/preferences";
import { useTranslation } from "@/platform/i18n";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { ListRow } from "@/platform/ui/list";
import { Button } from "@/platform/ui/button";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";
import { Keypad } from "@/platform/ui/keypad";
function HeightSheet({ onClose }: { onClose: () => void }) {
  const { preferences, setUiAsync, isSaving } = usePreferences();
  const sheet = useSheetPresent();
  const { t } = useTranslation();
  const unit = preferences.ui.lengthUnit;
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const saved = preferences.ui.heightCm;
  const initial = saved === null ? "" : (unit === "in" ? cmToIn(saved) : saved).toFixed(1);
  const form = useForm({
    defaultValues: { value: initial },
    onSubmit: async ({ value }) => {
      // An untouched (or re-entered) height keeps its precise stored value: no write at all.
      const changed = changedCanonical(value.value, initial, (shown) =>
        unit === "in" ? inToCm(shown) : shown,
      );
      if (changed === undefined && value.value !== "") {
        onClose();
        return;
      }
      const cm = value.value === "" ? null : (changed ?? null);
      if (cm === null && saved === null) {
        onClose();
        return;
      }
      if (cm !== null && (!Number.isFinite(cm) || cm < 100 || cm > 250)) {
        setError(t("body__invalid_height"));
        return;
      }
      try {
        await setUiAsync({ heightCm: cm });
        onClose();
      } catch {
        setError(t("errors__unknown"));
      }
    },
  });
  const value = useStore(form.store, (s) => s.values.value);
  return (
    <BottomSheet
      isOpen={sheet.isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="bg-overlay"
          contentContainerClassName="gap-4 p-4"
        >
          {sheet.probe}
          <BottomSheet.Title>{t("body__height")}</BottomSheet.Title>
          <Text className="font-semibold text-numeric-xl tabular-nums text-foreground">
            {t("body__value", { value, unit })}
          </Text>
          {error ? (
            <Text accessibilityRole="alert" className="font-normal text-body text-danger">
              {error}
            </Text>
          ) : null}
          <Button isDisabled={isSaving} onPress={() => void form.handleSubmit()}>
            <Button.Label>{t("body__save")}</Button.Label>
          </Button>
          <Keypad
            allowPoint
            hasNext={false}
            stepText="0.5"
            labels={{
              point: t("session__key_point"),
              backspace: t("session__key_backspace"),
              decrease: t("session__key_decrease", { step: 0.5 }),
              increase: t("session__key_increase", { step: 0.5 }),
              next: t("session__key_next"),
              done: t("session__done"),
            }}
            onKey={(key) => {
              const next =
                key === "backspace"
                  ? value.slice(0, -1)
                  : key === "."
                    ? fresh
                      ? "0."
                      : value.includes(".")
                        ? value
                        : value + "."
                    : (fresh ? "" : value) + key;
              if ((next.split(".")[1]?.length ?? 0) <= 1) form.setFieldValue("value", next);
              setFresh(false);
            }}
            onStep={(direction) => {
              form.setFieldValue("value", (Number(value) + direction * 0.5).toFixed(1));
              setFresh(true);
            }}
            onNext={() => undefined}
            onDone={() => void form.handleSubmit()}
          />
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
export function HeightRow() {
  const cm = usePreference((preferences) => preferences.ui.heightCm);
  const unit = usePreference((preferences) => preferences.ui.lengthUnit);
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={t("body__height")}
        value={
          cm === null
            ? t("body__not_set")
            : t("body__value", {
                value: formatBodyValue(unit === "in" ? cmToIn(cm) : cm, i18n.language),
                unit,
              })
        }
        onPress={() => setOpen(true)}
      />
      {open ? <HeightSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
