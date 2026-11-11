import { BottomSheet, Switch } from "heroui-native";
import { useForm } from "@tanstack/react-form";
import {
  gymEquipmentInput,
  KG_PER_LB,
  parseWeight,
  formatWeight,
  type GymEquipmentInput,
  type WeightUnit,
} from "@workspace/shared";
import type { EquipmentRow } from "@workspace/sync";
import { Trash } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/platform/i18n";
import { TextField } from "@/platform/forms/text-field";
import { Button } from "@/platform/ui/button";
import { ScrollPage } from "@/platform/ui/page";
import { ListSection, ListRow } from "@/platform/ui/list";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { SwipeGroup, SwipeRow } from "@/platform/ui/swipe-row";
import { kitGroups, missingKitItems } from "./plate-view";
import { useEquipmentLabel } from "./use-equipment-label";
import { useEquipment } from "./use-plates";

type FormTarget = { kind: GymEquipmentInput["kind"]; unit: WeightUnit; opening: number };

/** The user's bars and plates by unit; a Back button returns to wherever it was opened from. */
export function ManageEquipmentScreen() {
  const { t } = useTranslation();
  const state = useEquipment();
  const label = useEquipmentLabel();
  const groups = kitGroups(state.rows, state.unit);
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const openForm = (kind: FormTarget["kind"], unit: WeightUnit) => {
    setTarget((current) => ({ kind, unit, opening: (current?.opening ?? 0) + 1 }));
    setFormOpen(true);
  };
  return (
    <>
      <ScrollPage title={t("plates__manage")} back backFallback="/">
        {state.failed ? (
          <Button onPress={state.retry}>{t("plates__retry")}</Button>
        ) : state.loading ? (
          <Text className="text-body text-muted">{t("plates__loading")}</Text>
        ) : null}
        <SwipeGroup>
          {groups.flatMap((group, index) => {
            const incomplete = group.bars.length === 0 || group.plates.length === 0;
            const canAddKit =
              index === 0 &&
              incomplete &&
              !state.loading &&
              !state.failed &&
              missingKitItems(state.rows, group.unit).length > 0;
            return [
              ...(canAddKit
                ? [
                    <Button
                      key={`${group.unit}-kit`}
                      variant="secondary"
                      onPress={() => void state.addKit(group.unit)}
                    >
                      {t("plates__add_kit", { unit: group.unit })}
                    </Button>,
                  ]
                : []),
              ...(["bar", "plate"] as const).map((section) => (
                <ListSection
                  key={`${group.unit}-${section}`}
                  title={t(section === "bar" ? "plates__bars_in" : "plates__plates_in", {
                    unit: group.unit,
                  })}
                >
                  {(section === "bar" ? group.bars : group.plates).map((item) => (
                    <SwipeRow
                      key={item.id}
                      actions={[
                        {
                          key: "delete",
                          label: t("plates__delete"),
                          icon: Trash,
                          tone: "danger",
                          onPress: () => void state.remove(item),
                        },
                      ]}
                    >
                      {(a11y) => (
                        <View
                          {...a11y}
                          className="flex-row items-center gap-3 bg-surface px-4 py-3"
                        >
                          <View className="flex-1">
                            <Text className="text-body text-foreground">{label(item)}</Text>
                            {item.kind === "plate" ? (
                              <Text className="text-caption text-muted">
                                {item.count === null
                                  ? t("plates__unlimited")
                                  : t("plates__pairs", { count: item.count })}
                              </Text>
                            ) : null}
                          </View>
                          <EquipmentSwitch item={item} name={label(item)} save={state.save} />
                        </View>
                      )}
                    </SwipeRow>
                  ))}
                  <ListRow
                    title={t(section === "bar" ? "plates__custom_bar" : "plates__custom_plate")}
                    onPress={() => openForm(section, group.unit)}
                  />
                </ListSection>
              )),
            ];
          })}
        </SwipeGroup>
      </ScrollPage>
      <CustomEquipmentSheet
        isOpen={formOpen}
        target={target}
        save={state.save}
        onClose={() => setFormOpen(false)}
      />
    </>
  );
}

/** The custom bar or plate form in a bottom sheet, so it is on screen whatever the list holds. */
function CustomEquipmentSheet({
  isOpen,
  target,
  save,
  onClose,
}: {
  isOpen: boolean;
  target: FormTarget | null;
  save: ReturnType<typeof useEquipment>["save"];
  onClose: () => void;
}) {
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((keyboard) => keyboard.height);
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          Keyboard.dismiss();
          onClose();
        }
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          bottomInset={keyboardHeight}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          enableContentPanningGesture={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          {target ? (
            <CustomEquipmentForm
              key={target.opening}
              kind={target.kind}
              unit={target.unit}
              save={save}
              close={onClose}
            />
          ) : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function CustomEquipmentForm({
  kind,
  unit,
  save,
  close,
}: {
  kind: GymEquipmentInput["kind"];
  unit: WeightUnit;
  save: (item: GymEquipmentInput) => Promise<string[] | null>;
  close: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  const form = useForm({
    defaultValues: { weight: "", name: "", pairs: "" },
    onSubmit: async ({ value }) => {
      const parsedWeight = parseWeight(value.weight, unit);
      const weight =
        parsedWeight === null
          ? null
          : unit === "lb"
            ? Number(formatWeight(parsedWeight, unit)) * KG_PER_LB
            : parsedWeight;
      const parsed = gymEquipmentInput.safeParse({
        kind,
        unit,
        weight_kg: weight,
        label: value.name.trim() || null,
        count: kind === "plate" && value.pairs.trim() ? Number(value.pairs) : null,
        enabled: true,
      });
      if (
        !parsed.success ||
        (kind === "plate" && (weight === null || weight <= 0)) ||
        (kind === "plate" && parsed.data.count !== null && parsed.data.count < 1) ||
        (kind === "bar" && !value.name.trim())
      ) {
        setError(true);
        return;
      }
      if (await save(parsed.data)) close();
    },
  });
  return (
    <View className="gap-3">
      <BottomSheet.Title className="px-1 font-semibold text-title-lg">
        {t(kind === "bar" ? "plates__custom_bar" : "plates__custom_plate")}
      </BottomSheet.Title>
      <form.Field name="weight">
        {(field) => (
          <TextField
            field={field}
            label={t("plates__weight_field", { unit })}
            keyboardType="decimal-pad"
          />
        )}
      </form.Field>
      {kind === "bar" ? (
        <form.Field name="name">
          {(field) => <TextField field={field} label={t("plates__name")} maxLength={100} />}
        </form.Field>
      ) : (
        <form.Field name="pairs">
          {(field) => (
            <TextField
              field={field}
              label={t("plates__count")}
              description={t("plates__count_hint")}
              keyboardType="number-pad"
            />
          )}
        </form.Field>
      )}
      {error ? (
        <Text accessibilityRole="alert" className="text-body text-danger">
          {t("plates__invalid")}
        </Text>
      ) : null}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(saving) => (
          <Button isDisabled={saving} onPress={() => void form.handleSubmit()}>
            {t("plates__save")}
          </Button>
        )}
      </form.Subscribe>
      <Button variant="ghost" onPress={close}>
        {t("plates__cancel")}
      </Button>
    </View>
  );
}

function EquipmentSwitch({
  item,
  name,
  save,
}: {
  item: EquipmentRow;
  name: string;
  save: ReturnType<typeof useEquipment>["save"];
}) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (pending === item.enabled) setPending(null);
  }, [pending, item.enabled]);
  const enabled = pending ?? item.enabled;
  return (
    <Switch
      accessibilityLabel={name}
      isDisabled={saving}
      isSelected={enabled}
      onSelectedChange={async (value) => {
        setPending(value);
        setSaving(true);
        const saved = await save({
          id: item.id,
          kind: item.kind,
          unit: item.unit,
          weight_kg: item.weightKg,
          label: item.label,
          count: item.count,
          enabled: value,
        });
        if (!saved) setPending(null);
        setSaving(false);
      }}
    >
      <Switch.Thumb />
    </Switch>
  );
}
