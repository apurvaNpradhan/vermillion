import { recordFlags, sessionTotals } from "@workspace/shared";
import { useRouter } from "expo-router";
import {
  DotsThreeVertical,
  PencilSimple,
  ShareNetwork,
  Trash,
  FloppyDisk,
  Medal,
} from "phosphor-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";
import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { Page } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { useWorkout, formatEffortRange, chipTexts, SetTextTable } from "@/training";
import { ExerciseHeading } from "@/exercise";
import { SectionHeader } from "@/platform/ui/section-header";
import { ListRow, ListSection } from "@/platform/ui/list";
import { StatTiles } from "@/platform/ui/stat-tiles";
import { useThemeColor } from "heroui-native";
import { formatElapsed } from "../clock";
import { loggedSetsOf } from "../set-values";
import { doneSummary, formatVolume } from "../summary";
import { useSession } from "../use-session";
import { useSessionActions } from "../use-session-actions";
import { useFinishSession } from "../use-finish-session";
import { useRecordHistory } from "../use-session-history";

export function SessionDetailScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const ink = useThemeColor("foreground");
  const router = useRouter();
  const state = useSession(id);
  const session = state.status === "ready" ? state.session : null;
  const source = useWorkout(session?.workoutId ?? "");
  const { preferences } = usePreferences();
  const actions = useSessionActions();
  const finish = useFinishSession();
  const history = useRecordHistory(
    state.status === "ready" ? state.session.exercises.map((entry) => entry.exerciseId) : [],
  );
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const totals = sessionTotals(session ? loggedSetsOf(session) : [], preferences.ui.bodyweightKg);
  const flags = recordFlags(history.sessions, preferences.ui.bodyweightKg);
  const unit = preferences.ui.weightUnit;
  const unitLabel = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const stats = t("session__share_stats", {
    duration: formatElapsed(
      session?.durationS ??
        (session
          ? (Date.parse(session.finishedAt ?? session.startedAt) - Date.parse(session.startedAt)) /
            1000
          : 0),
    ),
    sets: totals.sets,
    volume: formatVolume(totals.volume, unit, i18n.language),
    unit: unitLabel,
  });
  return (
    <Page
      title={session?.title ?? t("session__history")}
      back
      backFallback="/history"
      actions={
        session ? (
          <Button
            variant="ghost"
            accessibilityLabel={t("session__menu")}
            onPress={() => setMenu(true)}
          >
            <DotsThreeVertical color={ink} />
          </Button>
        ) : undefined
      }
    >
      {({ header, contentContainerStyle, ...scroll }) => (
        <Animated.ScrollView
          {...scroll}
          contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16, gap: 32 }}
        >
          {header}
          {state.status === "error" ? (
            <Button onPress={state.retry}>
              <Button.Label>{t("training__retry")}</Button.Label>
            </Button>
          ) : null}
          {!session ? (
            <Text className="text-body text-muted">
              {t(state.status === "loading" ? "common__loading" : "session__load_failed")}
            </Text>
          ) : (
            <>
              <View className="gap-4">
                <Text className="text-body text-muted">
                  {new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "full",
                    timeStyle: "short",
                    timeZone: preferences.timezone ?? undefined,
                  }).format(new Date(session.startedAt))}
                </Text>
                {source.status === "ready" ? (
                  <ListSection variant="plain">
                    <ListRow
                      title={t("session__from_workout", {
                        title: source.workout.title ?? t("training__workout"),
                      })}
                      onPress={() =>
                        router.push({
                          pathname: "/train/workout/[id]",
                          params: { id: source.workout.id },
                        })
                      }
                    />
                  </ListSection>
                ) : null}
                <StatTiles
                  items={[
                    {
                      label: t("stats__duration"),
                      value: formatElapsed(
                        session.durationS ??
                          (Date.parse(session.finishedAt ?? session.startedAt) -
                            Date.parse(session.startedAt)) /
                            1000,
                      ),
                    },
                    {
                      label: t("stats__volume"),
                      value: t("home__volume_value", {
                        value: formatVolume(totals.volume, unit, i18n.language),
                        unit: unitLabel,
                      }),
                    },
                    { label: t("stats__sets"), value: String(totals.sets) },
                    {
                      label: t("stats__records"),
                      value: String(
                        session.exercises.flatMap((e) => e.sets).filter((s) => flags.has(s.id))
                          .length,
                      ),
                    },
                  ]}
                />
                {session.note ? (
                  <Text className="text-body text-foreground">{session.note}</Text>
                ) : null}
              </View>
              <MuscleDistribution
                preview
                split
                sets={loggedSetsOf(session)}
                exercises={session.exercises.flatMap((entry) =>
                  entry.exercise
                    ? [
                        {
                          id: entry.exerciseId,
                          primary_muscle: entry.exercise.primaryMuscle,
                          secondary_muscles: entry.exercise.secondaryMuscles,
                        },
                      ]
                    : [],
                )}
              />
              <View className="gap-1">
                <SectionHeader
                  title={t("session__workout_section")}
                  actionLabel={t("session__edit")}
                  onAction={() => router.push({ pathname: "/session/[id]", params: { id } })}
                />
                {session.exercises.map((entry) => {
                  const chips = chipTexts(entry.sets, {
                    working: "",
                    warmup: t("training__chip_warmup"),
                    drop: t("training__chip_drop"),
                    failure: t("training__chip_failure"),
                    top: t("training__chip_top"),
                    backoff: t("training__chip_backoff"),
                    myo: t("training__chip_myo"),
                  });
                  const rows = entry.sets.map((set, index) => ({
                    key: set.id,
                    marker: chips[index] ?? String(index + 1),
                    kind: set.kind,
                    cells: [
                      doneSummary([{ ...set, kind: "working" }], entry.type, unit, unitLabel),
                      set.rpe === null
                        ? ""
                        : t("session__effort_value", {
                            scale: t(
                              preferences.ui.effortScale === "rir"
                                ? "training__effort_rir"
                                : "training__effort_rpe",
                            ),
                            value: formatEffortRange(set.rpe, set.rpe, preferences.ui.effortScale),
                          }),
                    ],
                  }));
                  return (
                    <View key={entry.id} className="gap-1 py-2">
                      <ExerciseHeading
                        title={entry.title}
                        thumbnailKey={entry.exercise?.thumbnailKey ?? null}
                        muscle={entry.exercise?.primaryMuscle ?? "chest"}
                        onPress={() =>
                          router.push({
                            pathname: "/exercise-view/[id]",
                            params: { id: entry.exerciseId },
                          })
                        }
                      />
                      {entry.note ? (
                        <Text className="px-1 text-caption text-muted">{entry.note}</Text>
                      ) : null}
                      <SetTextTable
                        headers={[t("session__col_result"), ""]}
                        flex={[2, 1]}
                        rows={rows}
                        trailing={(row) =>
                          flags.has(row.key) ? (
                            <View
                              accessible
                              accessibilityLabel={t("session__record_badge")}
                              className="pl-2"
                            >
                              <Medal color={ink} size={18} weight="fill" />
                            </View>
                          ) : null
                        }
                      />
                    </View>
                  );
                })}
              </View>
              <ActionSheet
                isOpen={menu}
                onOpenChange={setMenu}
                title={session.title}
                actions={[
                  {
                    key: "edit",
                    label: t("session__edit"),
                    icon: PencilSimple,
                    onPress: () => router.push({ pathname: "/session/[id]", params: { id } }),
                  },
                  {
                    key: "save",
                    label: t("session__save_new_workout"),
                    icon: FloppyDisk,
                    onPress: () => {
                      void finish
                        .applyWorkout(id, { saveNew: true, structure: true, targets: true })
                        .then((saved) => {
                          if (saved)
                            router.push({ pathname: "/train/workout/[id]", params: { id: saved } });
                        });
                    },
                  },
                  {
                    key: "share",
                    label: t("session__share_text"),
                    icon: ShareNetwork,
                    onPress: () => {
                      void finish.share(session, stats);
                    },
                  },
                  {
                    key: "delete",
                    label: t("session__delete"),
                    icon: Trash,
                    tone: "danger",
                    onPress: () => setConfirm(true),
                  },
                ]}
              />
              <ConfirmSheet
                destructive
                isOpen={confirm}
                onOpenChange={setConfirm}
                title={t("session__delete")}
                description={t("session__delete_description")}
                cancelLabel={t("common__cancel")}
                confirmLabel={t("session__delete")}
                onConfirm={async () => {
                  if (await actions.discard(id, session.title)) router.back();
                }}
              />
            </>
          )}
        </Animated.ScrollView>
      )}
    </Page>
  );
}
