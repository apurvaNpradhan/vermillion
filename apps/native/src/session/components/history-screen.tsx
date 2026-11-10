import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { sessionTotals } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { useRouter } from "expo-router";
import { ClockCounterClockwise } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { groupSessionWeeks } from "../history";
import { formatElapsed } from "../clock";
import { formatVolume } from "../summary";
import { useSessionHistory } from "../use-session-history";
import { useSession } from "../use-session";

type HistoryItem =
  | { kind: "week"; id: string; sessions: FinishedSession[] }
  | { kind: "session"; id: string; session: FinishedSession };
export function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const history = useSessionHistory();
  const { preferences } = usePreferences();
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const items: HistoryItem[] = groupSessionWeeks(history.sessions, timezone).flatMap(
    (group): HistoryItem[] => [
      { kind: "week", id: group.week, sessions: group.sessions },
      ...group.sessions.map((session): HistoryItem => ({
        kind: "session",
        id: session.id,
        session,
      })),
    ],
  );
  return (
    <Page
      title={t("session__history")}
      actions={
        <Button onPress={() => router.push("/history/log-past")}>
          <Button.Label>{t("session__log_past")}</Button.Label>
        </Button>
      }
    >
      {({ header, contentContainerStyle, ...scroll }) => (
        <AnimatedLegendList
          {...scroll}
          data={history.loading || history.failed ? [] : items}
          keyExtractor={(item) => item.id}
          estimatedItemSize={100}
          contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16 }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            history.failed ? (
              <Button onPress={history.retry}>
                <Button.Label>{t("training__retry")}</Button.Label>
              </Button>
            ) : history.loading ? (
              <Text className="text-body text-muted">{t("common__loading")}</Text>
            ) : (
              <EmptyState icon={ClockCounterClockwise} title={t("session__history_empty")} />
            )
          }
          renderItem={({ item }) => {
            if (item.kind === "week") {
              const totals = sessionTotals(
                item.sessions.flatMap((session) => session.sets),
                preferences.ui.bodyweightKg,
              );
              return (
                <View className="gap-2 py-4">
                  <Text accessibilityRole="header" className="text-title-md text-foreground">
                    {t("session__week", {
                      date: new Intl.DateTimeFormat(i18n.language, {
                        timeZone: "UTC",
                        dateStyle: "medium",
                      }).format(new Date(`${item.id}T12:00:00Z`)),
                    })}
                  </Text>
                  <Text className="text-caption text-muted">
                    {t("session__week_totals", {
                      sessions: item.sessions.length,
                      sets: totals.sets,
                      volume: formatVolume(totals.volume, preferences.ui.weightUnit, i18n.language),
                      unit: t(
                        preferences.ui.weightUnit === "kg"
                          ? "training__unit_kg"
                          : "training__unit_lb",
                      ),
                    })}
                  </Text>
                </View>
              );
            }
            const session = item.session;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: "/history/[id]", params: { id: session.id } })
                }
                className="mb-2 gap-1 rounded-xl bg-surface p-4"
              >
                <Text className="text-title-md text-foreground">{session.title}</Text>
                <Text className="text-body text-muted">
                  {t("session__history_row", {
                    date: new Intl.DateTimeFormat(i18n.language, {
                      timeZone: timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(session.started_at)),
                    duration: formatElapsed(
                      session.durationS ??
                        Math.max(
                          0,
                          (Date.parse(session.finished_at ?? session.started_at) -
                            Date.parse(session.started_at)) /
                            1000,
                        ),
                    ),
                  })}
                </Text>
                <HistoryExerciseNames id={session.id} />
              </Pressable>
            );
          }}
        />
      )}
    </Page>
  );
}
function HistoryExerciseNames({ id }: { id: string }) {
  const state = useSession(id);
  return state.status === "ready" ? (
    <Text className="text-caption text-muted">
      {state.session.exercises
        .slice(0, 3)
        .map((entry) => entry.title)
        .join(" · ")}
    </Text>
  ) : null;
}
