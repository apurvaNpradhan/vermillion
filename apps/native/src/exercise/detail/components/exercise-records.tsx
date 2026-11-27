import { SheetPortal } from "@/platform/ui/modal-state";
import {
  recordsMovedByEffort,
  type ExerciseType,
  type RecordKey,
  type SessionHistory,
  type WeightUnit,
} from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";

import { datedRecords, recordsByYear, recordYears } from "../numbers";
import { useEffortNote } from "../use-effort-note";
import { useMetricFormat } from "../use-metric-format";

/** A record row: the shown best, and the all-time best beside it when a year is chosen. */
type YearRecord = ReturnType<typeof datedRecords>[number] & { allTime: number | null };

const HELP_KEYS = [
  "heaviest_weight",
  "estimated_one_rep_max",
  "set_volume",
  "session_volume",
  "longest_duration",
  "longest_distance",
  "best_pace",
  "reps_1",
] satisfies RecordKey[];

const HELP_TEXT = {
  heaviest_weight: "exercise__help_weight",
  estimated_one_rep_max: "exercise__help_one_rm",
  set_volume: "exercise__help_set_volume",
  session_volume: "exercise__help_session_volume",
  longest_duration: "exercise__help_duration",
  longest_distance: "exercise__help_distance",
  best_pace: "exercise__help_pace",
  reps_1: "exercise__help_reps",
} as const satisfies Record<(typeof HELP_KEYS)[number], string>;

/**
 * Records as a two-column grid of tiles, each a best in human units with the day it was set. With
 * more than one year of training a chip row narrows them to a year and shows the all-time best
 * under each.
 */
export function ExerciseRecords({
  sessions,
  exerciseId,
  type,
  unit,
  bodyweightKg,
  timezone,
}: {
  sessions: readonly SessionHistory[];
  exerciseId: string;
  type: ExerciseType;
  unit: WeightUnit;
  bodyweightKg: number | null;
  timezone: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { label, format } = useMetricFormat(type, unit);
  const [help, setHelp] = useState(false);
  const moved = useMemo(
    () => recordsMovedByEffort(sessions, bodyweightKg),
    [sessions, bodyweightKg],
  );
  const note = useEffortNote(moved);
  const [year, setYear] = useState<number | null>(null);
  const date = (value: string | number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: timezone ?? undefined,
    }).format(new Date(value));
  const years = recordYears(sessions, exerciseId, timezone);
  // A year that no longer has data (a deleted Session) falls back to all time.
  const activeYear = year !== null && years.includes(year) ? year : null;
  const records =
    activeYear === null
      ? datedRecords(sessions, exerciseId, bodyweightKg).map((record): YearRecord => ({
          ...record,
          allTime: null,
        }))
      : recordsByYear(sessions, exerciseId, bodyweightKg, activeYear, timezone);
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
          {t("exercise__records")}
        </Text>
        <Button
          size="sm"
          variant="tertiary"
          accessibilityLabel={t("exercise__records_help_title")}
          onPress={() => setHelp(true)}
        >
          <Button.Label>{t("exercise__records_help_symbol")}</Button.Label>
        </Button>
      </View>
      {note.visible ? (
        <View className="gap-1 rounded-xl bg-surface p-3">
          <Text className="font-normal text-caption text-muted">
            {t("exercise__records_effort_note")}
          </Text>
          <View className="flex-row justify-end">
            <Button size="sm" variant="tertiary" onPress={note.dismiss}>
              <Button.Label>{t("exercise__records_effort_note_ok")}</Button.Label>
            </Button>
          </View>
        </View>
      ) : null}
      {years.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {([null, ...years] satisfies (number | null)[]).map((value) => (
            <Button
              key={value ?? "all"}
              size="sm"
              variant={value === activeYear ? "primary" : "tertiary"}
              accessibilityState={{ selected: value === activeYear }}
              onPress={() => setYear(value)}
            >
              <Button.Label>
                {value === null ? t("exercise__records_all_time") : String(value)}
              </Button.Label>
            </Button>
          ))}
        </ScrollView>
      ) : null}
      {records.length ? (
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {records.map((record) => (
            <View
              key={record.key}
              accessible
              accessibilityLabel={`${label(record.key)}, ${format(record.value, record.key)}, ${date(record.date)}`}
              className="w-[48.5%] gap-1 rounded-xl bg-surface p-3"
            >
              <Text numberOfLines={1} className="font-normal text-caption text-muted">
                {label(record.key)}
              </Text>
              <Text
                className="text-title-md font-semibold text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {format(record.value, record.key)}
              </Text>
              {record.allTime !== null ? (
                <Text
                  className="font-normal text-caption text-muted"
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {t("exercise__records_all_time_value", {
                    value: format(record.allTime, record.key),
                  })}
                </Text>
              ) : null}
              <Text numberOfLines={1} className="font-normal text-caption tabular-nums text-muted">
                {date(record.date)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="font-normal text-body text-muted">{t("exercise__records_empty")}</Text>
      )}
      <BottomSheet isOpen={help} onOpenChange={setHelp}>
        <SheetPortal>
          <BottomSheet.Overlay />
          <ScrollableSheetContent size="tall">
            <BottomSheet.Title>{t("exercise__records_help_title")}</BottomSheet.Title>
            <BottomSheet.Description>{t("exercise__records_help_intro")}</BottomSheet.Description>
            <View className="gap-4 pb-8">
              {HELP_KEYS.map((key) => (
                <View key={key} className="gap-1">
                  <Text className="text-body font-semibold text-foreground">
                    {key === "reps_1" ? t("exercise__rep_records") : label(key)}
                  </Text>
                  <Text className="font-normal text-body text-muted">{t(HELP_TEXT[key])}</Text>
                </View>
              ))}
            </View>
          </ScrollableSheetContent>
        </SheetPortal>
      </BottomSheet>
    </View>
  );
}
