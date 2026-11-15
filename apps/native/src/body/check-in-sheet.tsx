import { useForm, useStore } from "@tanstack/react-form";
import { BottomSheet } from "heroui-native";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { changedCanonical, lastN, type BodyMetric, type MeasurementInput } from "@workspace/shared";
import type { WatchedMeasurement } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { Keypad } from "@/platform/ui/keypad";
import { Button } from "@/platform/ui/button";
import { MeasurementDate } from "./measurement-date";
import { metricLabels } from "./metric-labels";
import { useMeasurements } from "./use-measurements";
import { useMeasurementActions } from "./use-measurement-actions";
function CheckInForm({
  onClose,
  entry,
  state,
}: {
  onClose: () => void;
  entry?: WatchedMeasurement;
  state: ReturnType<typeof useMeasurements>;
}) {
  const actions = useMeasurementActions();
  const { t } = useTranslation();
  const metrics: BodyMetric[] = entry ? [entry.metric] : [...state.tracked, "weight"];
  const [active, setActive] = useState(0);
  const [fresh, setFresh] = useState(true);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef(new Map<number, number>());
  const form = useForm({
    defaultValues: {
      rows: metrics.map((metric) => {
        const last = entry ?? lastN(state.forMetric(metric), 1)[0];
        const shown = last ? state.display(metric, last.value).toFixed(1) : "";
        return {
          metric,
          value: shown,
          // What the row showed when the sheet opened; an edit writes the value only if it differs.
          initial: shown,
          touched: false,
        };
      }),
      date: entry ? new Date(entry.measured_at).toISOString() : new Date().toISOString(),
    },
    onSubmit: async ({ value }) => {
      const changedValue = (row: { metric: BodyMetric; value: string; initial: string }) =>
        changedCanonical(row.value, row.initial, (shown) => state.canonical(row.metric, shown));
      if (entry) {
        // An edit sends only what changed, so a date-only edit never rewrites the value.
        const row = value.rows[0];
        const dateChanged = value.date !== new Date(entry.measured_at).toISOString();
        const changed = row ? changedValue(row) : undefined;
        const patch = {
          ...(changed !== undefined ? { value: changed } : {}),
          ...(dateChanged
            ? { measured_at: value.date, local_date: state.localDate(value.date) }
            : {}),
        };
        if (!Object.keys(patch).length || (await actions.edit(entry, patch))) onClose();
        return;
      }
      const rows: MeasurementInput[] = value.rows.flatMap((row) =>
        row.touched
          ? [
              {
                metric: row.metric,
                value: state.canonical(row.metric, Number(row.value)),
                measured_at: value.date,
                local_date: state.localDate(value.date),
                source: "manual",
              },
            ]
          : [],
      );
      if (!rows.length || (await actions.save(rows))) onClose();
    },
  });
  const { rows, date } = useStore(form.store, (s) => s.values);
  const row = rows[active];
  const metric = row?.metric ?? "weight";
  const unit = state.unit(metric);
  const step = metric === "weight" ? (unit === "lb" ? 0.2 : 0.1) : unit === "in" ? 0.25 : 0.5;
  const edit = (value: string) => {
    form.setFieldValue(`rows[${active}].value`, value);
    form.setFieldValue(`rows[${active}].touched`, true);
  };
  const select = (index: number) => {
    setActive(index);
    setFresh(true);
    scroll.current?.scrollTo({ y: offsets.current.get(index) ?? 0, animated: true });
  };
  return (
    <BottomSheet
      isOpen
      onOpenChange={(open) => {
        if (!open && !actions.busy) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          backgroundClassName="bg-overlay"
          contentContainerClassName="gap-3 px-4 pb-4"
        >
          <BottomSheet.Title>
            {t(entry ? "body__edit_measurement" : "body__check_in")}
          </BottomSheet.Title>
          <MeasurementDate
            value={date}
            timeZone={state.zone}
            onChange={(next) => form.setFieldValue("date", next)}
          />
          <ScrollView ref={scroll} style={{ maxHeight: 220 }}>
            {rows.map((item, index) => (
              <Pressable
                key={item.metric}
                onLayout={(event) => offsets.current.set(index, event.nativeEvent.layout.y)}
                accessibilityRole="button"
                accessibilityState={{ selected: index === active }}
                accessibilityLabel={t("body__measurement_row", {
                  metric: t(metricLabels[item.metric]),
                  value: item.value || t("body__no_data"),
                  unit: state.unit(item.metric),
                })}
                disabled={actions.busy}
                onPress={() => select(index)}
                className={`flex-row justify-between gap-3 border-b border-separator px-2 py-3 ${index === active ? "bg-default" : ""}`}
              >
                <Text className="text-body text-foreground">{t(metricLabels[item.metric])}</Text>
                <Text className="text-body tabular-nums text-foreground">
                  {t("body__value", {
                    value: item.value || t("body__no_data"),
                    unit: state.unit(item.metric),
                  })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {actions.error ? (
            <Text accessibilityRole="alert" className="text-body text-danger">
              {actions.error}
            </Text>
          ) : null}
          <Button
            isDisabled={actions.busy || state.loading || state.failed}
            onPress={() => void form.handleSubmit()}
          >
            <Button.Label>{t("body__save")}</Button.Label>
          </Button>
          <Keypad
            allowPoint
            hasNext={active < rows.length - 1}
            stepText={String(step)}
            labels={{
              point: t("session__key_point"),
              backspace: t("session__key_backspace"),
              decrease: t("session__key_decrease", { step }),
              increase: t("session__key_increase", { step }),
              next: t("session__key_next"),
              done: t("session__done"),
            }}
            onKey={(key) => {
              if (actions.busy) return;
              const current = row?.value ?? "";
              const next =
                key === "backspace"
                  ? current.slice(0, -1)
                  : key === "."
                    ? fresh
                      ? "0."
                      : current.includes(".")
                        ? current
                        : current + "."
                    : (fresh ? "" : current) + key;
              if ((next.split(".")[1]?.length ?? 0) <= 1) edit(next);
              setFresh(false);
            }}
            onStep={(direction) => {
              if (actions.busy) return;
              edit(
                (Number(row?.value || 0) + direction * step).toFixed(
                  unit === "in" && metric !== "weight" ? 2 : 1,
                ),
              );
              setFresh(true);
            }}
            onNext={() => {
              if (!actions.busy) select(Math.min(active + 1, rows.length - 1));
            }}
            onDone={() => {
              if (!actions.busy) void form.handleSubmit();
            }}
          />
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export function CheckInSheet(props: { onClose: () => void; entry?: WatchedMeasurement }) {
  const state = useMeasurements();
  const { t } = useTranslation();
  if (state.loading || state.failed)
    return (
      <BottomSheet
        isOpen
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            backgroundClassName="bg-overlay"
            contentContainerClassName="gap-4 p-4"
          >
            <BottomSheet.Title>{t("body__check_in")}</BottomSheet.Title>
            {state.failed ? (
              <Button onPress={state.retry}>
                <Button.Label>{t("training__retry")}</Button.Label>
              </Button>
            ) : (
              <Text className="text-body text-muted">{t("common__loading")}</Text>
            )}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    );
  return <CheckInForm {...props} state={state} />;
}
