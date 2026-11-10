import type { EquipmentRow } from "@workspace/sync";
import { Switch } from "heroui-native";
import { useForm } from "@tanstack/react-form";
import {
  gymEquipmentInput,
  KG_PER_LB,
  parseWeight,
  formatWeight,
  type GymEquipmentInput,
} from "@workspace/shared";
import { Trash } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { TextField } from "@/platform/forms/text-field";
import { Button } from "@/platform/ui/button";
import { ScrollPage } from "@/platform/ui/page";
import { ListSection, ListRow } from "@/platform/ui/list";
import { SwipeGroup, SwipeRow } from "@/platform/ui/swipe-row";
import { useEquipment } from "./use-plates";

export function ManageEquipmentScreen() {
  const { t } = useTranslation();
  const state = useEquipment();

  const [kind, setKind] = useState<GymEquipmentInput["kind"] | null>(null);
  return (
    <ScrollPage title={t("plates__manage")}>
      {state.failed ? (
        <Button onPress={state.retry}>{t("plates__retry")}</Button>
      ) : state.loading ? (
        <Text className="text-body text-muted">{t("plates__loading")}</Text>
      ) : null}
      <SwipeGroup>
        {(["bar", "plate"] as const).map((section) => (
          <ListSection
            key={section}
            title={t(section === "bar" ? "plates__bars" : "plates__plates")}
          >
            {state.rows.flatMap((item) =>
              item.kind === section
                ? [
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
                            <Text className="text-body text-foreground">
                              {t("plates__item", {
                                name: item.label ?? "",
                                weight: formatWeight(item.weightKg, state.unit),
                                unit: state.unit,
                              })}
                            </Text>
                            {item.kind === "plate" ? (
                              <Text className="text-caption text-muted">
                                {item.count === null
                                  ? t("plates__unlimited")
                                  : t("plates__pairs", { count: item.count })}
                              </Text>
                            ) : null}
                          </View>
                          <EquipmentSwitch item={item} unit={state.unit} save={state.save} />
                        </View>
                      )}
                    </SwipeRow>,
                  ]
                : [],
            )}
            <ListRow
              title={t(section === "bar" ? "plates__custom_bar" : "plates__custom_plate")}
              onPress={() => setKind(section)}
            />
          </ListSection>
        ))}
      </SwipeGroup>
      {kind ? (
        <CustomEquipmentForm
          key={`${kind}-${state.unit}`}
          kind={kind}
          unit={state.unit}
          save={state.save}
          close={() => setKind(null)}
        />
      ) : null}
    </ScrollPage>
  );
}

function CustomEquipmentForm({
  kind,
  unit,
  save,
  close,
}: {
  kind: GymEquipmentInput["kind"];
  unit: GymEquipmentInput["unit"];
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
      <Text className="text-title-md text-foreground">
        {t(kind === "bar" ? "plates__custom_bar" : "plates__custom_plate")}
      </Text>
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
  unit,
  save,
}: {
  item: EquipmentRow;
  unit: GymEquipmentInput["unit"];
  save: ReturnType<typeof useEquipment>["save"];
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (pending === item.enabled) setPending(null);
  }, [pending, item.enabled]);
  const enabled = pending ?? item.enabled;
  return (
    <Switch
      accessibilityLabel={t("plates__item", {
        name: item.label ?? "",
        weight: formatWeight(item.weightKg, unit),
        unit,
      })}
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
    />
  );
}
