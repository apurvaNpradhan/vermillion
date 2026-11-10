import { sessionTotals } from "@workspace/shared";
import { CheckCircle } from "phosphor-react-native";
import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Skeleton } from "@/platform/ui/skeleton";
import { usePreferences } from "@/preferences";

import { elapsedSeconds, formatElapsed } from "../clock";
import { loggedSetsOf } from "../set-values";
import { formatVolume } from "../summary";
import { useSession } from "../use-session";

/**
 * A simple summary shown after Finish: duration, volume and sets. The full Finish flow (editable
 * title, note and times, Update Workout, Records, Share) replaces this in a later slice.
 */
export function SessionSummaryScreen({ id, onDone }: { id: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { bottom, top } = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const state = useSession(id);
  const session = state.status === "ready" ? state.session : null;
  const totals = useMemo(
    () => (session ? sessionTotals(loggedSetsOf(session), preferences.ui.bodyweightKg) : null),
    [session, preferences.ui.bodyweightKg],
  );
  useEffect(() => {
    if (state.status === "missing") onDone();
  }, [state.status, onDone]);

  const unit = preferences.ui.weightUnit;
  const end = session?.finishedAt ? Date.parse(session.finishedAt) : 0;
  const seconds = session ? (session.durationS ?? elapsedSeconds(session.startedAt, end)) : 0;

  return (
    <View
      className="flex-1 justify-between bg-background px-4"
      style={{ paddingTop: top + 24, paddingBottom: bottom + 16 }}
    >
      {session && totals ? (
        <View className="gap-6">
          <EmptyState icon={CheckCircle} title={t("session__summary_title")} />
          <Text
            accessibilityRole="header"
            className="text-center font-semibold text-title-lg text-foreground"
          >
            {session.title}
          </Text>
          <View className="flex-row gap-3">
            <Stat label={t("session__stat_duration")} value={formatElapsed(seconds)} />
            <Stat
              label={t("session__stat_volume")}
              value={`${formatVolume(totals.volume, unit, i18n.language)} ${t(unit === "kg" ? "training__unit_kg" : "training__unit_lb")}`}
            />
            <Stat label={t("session__stat_sets")} value={String(totals.sets)} />
          </View>
        </View>
      ) : (
        <Skeleton label={t("common__loading")} className="h-24 w-full" />
      )}
      <Button variant="primary" onPress={onDone}>
        <Button.Label>{t("session__done")}</Button.Label>
      </Button>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-1 rounded-2xl bg-surface p-3">
      <Text className="text-caption text-muted">{label}</Text>
      <Text
        numberOfLines={1}
        className="font-semibold text-numeric-md text-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}
