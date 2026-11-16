import { useForm, useStore } from "@tanstack/react-form";
import { BottomSheet } from "heroui-native";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import {
  changedCanonical,
  lastN,
  type BodyMetric,
  type MeasurementInput,
  type ProgressPose,
} from "@workspace/shared";
import type { WatchedMeasurement } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { Keypad } from "@/platform/ui/keypad";
import { Button } from "@/platform/ui/button";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";
import { discardProcessed } from "@/media";
import { createPendingPhotos } from "./photos/pending-photos";
import { PhotoSlotSheet, PhotoSlots } from "./photos/photo-slots";
import { usePhotoActions } from "./photos/use-photo-actions";
import { acceptsMeasurementDraft } from "./measurement-draft";
import { MeasurementDate } from "./measurement-date";
import { metricLabels } from "./metric-labels";
import { useMeasurements } from "./use-measurements";
import { useMeasurementActions } from "./use-measurement-actions";
/** Rows shown at once: a window that follows the active row (the list is short enough to fit). */
const WINDOW = 4;

function CheckInForm({
  onClose,
  entry,
  state,
}: {
  onClose: () => void;
  entry?: WatchedMeasurement;
  state: ReturnType<typeof useMeasurements>;
}) {
  const sheet = useSheetPresent();
  const [pose, setPose] = useState<ProgressPose | null>(null);
  const actions = useMeasurementActions();
  const photoActions = usePhotoActions();
  const { t } = useTranslation();
  // Photos picked for this Check-in: processed already, written with the rest on Save.
  const [photoStore] = useState(() => createPendingPhotos(discardProcessed));
  const photos = useSyncExternalStore(photoStore.subscribe, photoStore.getSnapshot);
  useEffect(() => {
    photoStore.reopen();
    return () => photoStore.dispose();
  }, [photoStore]);
  const busy = actions.busy || photoActions.busy;
  const metrics: BodyMetric[] = entry ? [entry.metric] : [...state.tracked, "weight"];
  const [active, setActive] = useState(0);
  const [fresh, setFresh] = useState(true);
  const form = useForm({
    defaultValues: {
      rows: metrics.map((metric) => {
        const last = entry ?? lastN(state.forMetric(metric), 1)[0];
        const shown = last
          ? state.display(metric, last.value).toFixed(state.unit(metric) === "in" ? 2 : 1)
          : "";
        return {
          metric,
          value: entry ? shown : "",
          previous: last?.value,
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
        row.touched && row.value !== ""
          ? [
              {
                metric: row.metric,
                value:
                  row.value === row.initial && row.previous !== undefined
                    ? row.previous
                    : state.canonical(row.metric, Number(row.value)),
                measured_at: value.date,
                local_date: state.localDate(value.date),
                source: "manual",
              },
            ]
          : [],
      );
      const hasPhotos = Object.keys(photos).length > 0;
      if (!rows.length && !hasPhotos) return;
      if (hasPhotos) {
        if (
          !(await photoActions.saveCheckIn(rows, photos, value.date, state.localDate(value.date)))
        ) {
          photoStore.dispose();
          photoStore.reopen();
          return;
        }
        photoStore.release();
      } else if (!(await actions.save(rows))) return;
      onClose();
    },
  });
  const { rows, date } = useStore(form.store, (s) => s.values);
  const row = rows[active];
  const first = Math.max(0, Math.min(active - 1, rows.length - WINDOW));
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
  };
  return (
    <>
      <BottomSheet
        isOpen={sheet.isOpen}
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            backgroundClassName="bg-overlay"
            contentContainerClassName="gap-3 px-4 pb-4"
          >
            {sheet.probe}
            <BottomSheet.Title>
              {t(entry ? "body__edit_measurement" : "body__check_in")}
            </BottomSheet.Title>
            {entry ? null : <PhotoSlots store={photoStore} disabled={busy} onSelect={setPose} />}
            <MeasurementDate
              value={date}
              timeZone={state.zone}
              onChange={(next) => form.setFieldValue("date", next)}
            />
            <View>
              {rows.slice(first, first + WINDOW).map((item, offset) => {
                const index = first + offset;
                return (
                  <View key={item.metric} className="flex-row items-center gap-2">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: index === active }}
                      accessibilityLabel={t("body__measurement_row", {
                        metric: t(metricLabels[item.metric]),
                        value: item.touched
                          ? item.value || t("body__no_data")
                          : item.initial || t("body__no_data"),
                        unit: state.unit(item.metric),
                      })}
                      disabled={busy}
                      onPress={() => select(index)}
                      className={`flex-1 flex-row justify-between gap-3 rounded-xl px-2 py-3 active:opacity-70 ${index === active ? "bg-default" : ""}`}
                    >
                      <Text className="text-body text-foreground">
                        {t(metricLabels[item.metric])}
                      </Text>
                      <Text
                        className={`text-body tabular-nums ${!entry && !item.touched ? "text-muted" : "text-foreground"}`}
                      >
                        {t("body__value", {
                          value: item.touched
                            ? item.value || t("body__no_data")
                            : item.initial || t("body__no_data"),
                          unit: state.unit(item.metric),
                        })}
                      </Text>
                    </Pressable>
                    {!entry && item.initial && !item.touched ? (
                      <Button
                        variant="tertiary"
                        size="sm"
                        isDisabled={busy}
                        accessibilityLabel={t("body__same", {
                          metric: t(metricLabels[item.metric]),
                        })}
                        onPress={() => {
                          form.setFieldValue(`rows[${index}].value`, item.initial);
                          form.setFieldValue(`rows[${index}].touched`, true);
                        }}
                      >
                        <Button.Label>{t("body__same_short")}</Button.Label>
                      </Button>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {!entry ? (
              <Text className="text-caption text-muted">{t("body__ghost_hint")}</Text>
            ) : null}
            {actions.error || photoActions.error ? (
              <Text accessibilityRole="alert" className="text-body text-danger">
                {actions.error || photoActions.error}
              </Text>
            ) : null}
            <Button
              isDisabled={
                busy ||
                state.loading ||
                state.failed ||
                (!entry &&
                  !rows.some((r) => r.touched && r.value !== "") &&
                  !Object.keys(photos).length)
              }
              onPress={() => void form.handleSubmit()}
            >
              <Button.Label>
                {entry || Object.keys(photos).length
                  ? t("body__save")
                  : t("body__save_readings", {
                      count: rows.filter((r) => r.touched && r.value !== "").length,
                    })}
              </Button.Label>
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
                if (busy) return;
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
                if (acceptsMeasurementDraft(next, unit)) edit(next);
                setFresh(false);
              }}
              onStep={(direction) => {
                if (busy) return;
                edit(
                  (Number(row?.value || row?.initial || 0) + direction * step).toFixed(
                    unit === "in" && metric !== "weight" ? 2 : 1,
                  ),
                );
                setFresh(true);
              }}
              onNext={() => {
                if (!busy) select(Math.min(active + 1, rows.length - 1));
              }}
              onDone={() => {
                if (!busy) void form.handleSubmit();
              }}
            />
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
      {entry || !sheet.isOpen ? null : (
        <PhotoSlotSheet
          store={photoStore}
          actions={photoActions}
          pose={pose}
          onClose={() => setPose(null)}
        />
      )}
    </>
  );
}

export function CheckInSheet(props: { onClose: () => void; entry?: WatchedMeasurement }) {
  const state = useMeasurements();
  const { t } = useTranslation();
  const sheet = useSheetPresent();
  // Nothing while it loads: swapping one sheet for another in a single render leaves the second
  // one off-screen. Only a failed load gets a sheet of its own, with Retry.
  if (state.loading) return null;
  if (state.failed)
    return (
      <BottomSheet
        isOpen={sheet.isOpen}
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
            {sheet.probe}
            <BottomSheet.Title>{t("body__check_in")}</BottomSheet.Title>
            <Button onPress={state.retry}>
              <Button.Label>{t("training__retry")}</Button.Label>
            </Button>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    );
  return <CheckInForm {...props} state={state} />;
}
