import { useForm, useStore } from "@tanstack/react-form";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Text } from "react-native";
import { cmToIn, inToCm } from "@workspace/shared";
import { usePreferences } from "@/preferences";
import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";
import { Button } from "@/platform/ui/button";
import { Keypad } from "@/platform/ui/keypad";
function HeightSheet({ onClose }: { onClose: () => void }) {
  const { preferences, setUiAsync, isSaving } = usePreferences();
  const { t } = useTranslation();
  const unit = preferences.ui.lengthUnit;
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const form = useForm({
    defaultValues: {
      value:
        preferences.ui.heightCm === null
          ? ""
          : (unit === "in" ? cmToIn(preferences.ui.heightCm) : preferences.ui.heightCm).toFixed(1),
    },
    onSubmit: async ({ value }) => {
      const cm =
        value.value === ""
          ? null
          : unit === "in"
            ? inToCm(Number(value.value))
            : Number(value.value);
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
      isOpen
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content backgroundClassName="bg-overlay" contentContainerClassName="gap-4 p-4">
          <BottomSheet.Title>{t("body__height")}</BottomSheet.Title>
          <Text className="text-numeric-xl tabular-nums text-foreground">
            {t("body__value", { value, unit })}
          </Text>
          {error ? (
            <Text accessibilityRole="alert" className="text-body text-danger">
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
  const { preferences } = usePreferences();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const cm = preferences.ui.heightCm;
  const unit = preferences.ui.lengthUnit;
  return (
    <>
      <ListRow
        title={t("body__height")}
        value={
          cm === null
            ? t("body__not_set")
            : t("body__value", {
                value: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(
                  unit === "in" ? cmToIn(cm) : cm,
                ),
                unit,
              })
        }
        onPress={() => setOpen(true)}
      />
      {open ? <HeightSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
