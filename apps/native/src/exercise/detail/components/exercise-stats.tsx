import {
  exerciseRecords,
  SET_FIELDS,
  type ExerciseType,
  type SessionHistory,
  type WeightUnit,
} from "@workspace/shared";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { lastDoneLabel } from "@/platform/last-done";
import { topSet } from "../top-set";
import { useMetricFormat } from "../use-metric-format";
import { useTopSetText } from "../use-top-set-text";

type Tile = { key: string; label: string; value: string; detail?: string };

/**
 * Three tiles above the chart: the best set, the estimated one-rep max (or the best pace for a
 * run, row or ride; nothing for a timed hold or a rep count), and last time's top set with how
 * long ago it was. Sessions come newest first.
 */
export function ExerciseStatTiles({
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
  const setText = useTopSetText(unit);
  const { format } = useMetricFormat(type, unit);
  const fields: readonly string[] = SET_FIELDS[type];
  const records = exerciseRecords(sessions, bodyweightKg).get(exerciseId);
  const best = topSet(
    sessions.flatMap((session) => session.sets),
    exerciseId,
    type,
  );
  const latest = sessions[0];
  const last = latest ? topSet(latest.sets, exerciseId, type) : null;
  const oneRepMax = records?.get("estimated_one_rep_max");
  const pace = records?.get("best_pace");
  const tiles: Tile[] = [];
  if (best)
    tiles.push({ key: "best", label: t("exercise__stat_best"), value: setText(best, type) });
  if (oneRepMax !== undefined && fields.includes("weight")) {
    tiles.push({
      key: "one-rm",
      label: t("exercise__metric_one_rm"),
      value: format(oneRepMax, "estimated_one_rep_max"),
    });
  } else if (pace !== undefined) {
    tiles.push({
      key: "pace",
      label: t("exercise__metric_pace"),
      value: format(pace, "best_pace"),
    });
  }
  if (latest && last) {
    tiles.push({
      key: "last",
      label: t("exercise__stat_last"),
      value: setText(last, type),
      detail: lastDoneLabel(
        latest.started_at,
        new Date(),
        i18n.language,
        timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        "leading",
      ),
    });
  }
  if (tiles.length === 0) return null;
  return (
    <View className="flex-row gap-2">
      {tiles.map((tile) => (
        <View key={tile.key} className="min-w-0 flex-1 gap-1 rounded-xl bg-surface p-3">
          <Text numberOfLines={1} className="font-normal text-caption text-muted">
            {tile.label}
          </Text>
          <Text
            numberOfLines={2}
            className="text-title-md font-semibold text-foreground"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {tile.value}
          </Text>
          {tile.detail ? (
            <Text numberOfLines={1} className="font-normal text-caption text-muted">
              {tile.detail}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
