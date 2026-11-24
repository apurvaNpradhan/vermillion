import { SessionPhotos } from "@/session/screen/session-photos";
import { useWeight } from "@/body";
import { recordCount, recordFlags, sessionTotals, withWarmupsCounted } from "@workspace/shared";
import { useRouter } from "expo-router";
import {
  ArrowClockwise,
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
import { useAccentTextColor } from "@/platform/theme";
import { formatElapsed } from "@/session/timer/clock";
import { sessionDuration } from "@/session/share/stats";
import { loggedSetsOf } from "@/session/logging/set-values";
import { doneSummary, formatVolume } from "@/session/finish/summary";
import { useSession } from "@/session/screen/use-session";
import { useSessionActions } from "@/session/screen/use-session-actions";
import { useFinishSession } from "@/session/finish/use-finish-session";
import { useStartSession } from "@/session/lifecycle/use-start-session";
import { useRecordHistory } from "./use-session-history";
import { ANCHORED } from "@/platform/navigation/anchored";

export function SessionDetailScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const ink = useThemeColor("foreground");
  const accentText = useAccentTextColor();
  const router = useRouter();
  const state = useSession(id);
  const session = state.status === "ready" ? state.session : null;
  const source = useWorkout(session?.workoutId ?? "");
  const { preferences, timeZone } = usePreferences();
  const weight = useWeight();
  const actions = useSessionActions();
  const finish = useFinishSession();
  const { startAgain, sheet: startSheet } = useStartSession();
  const history = useRecordHistory(
    state.status === "ready" ? state.session.exercises.map((entry) => entry.exerciseId) : [],
  );
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const totals = sessionTotals(
    session ? loggedSetsOf(session, preferences.ui.countWarmups) : [],
    weight.bodyweightOn(session?.startedAt ?? new Date().toISOString()),
  );
  const flags = recordFlags(
    withWarmupsCounted(history.sessions, preferences.ui.countWarmups),
    weight.bodyweightOn(session?.startedAt ?? new Date().toISOString()),
  );
  const unit = preferences.ui.weightUnit;
  const display = {
    durationFormat: preferences.ui.durationFormat,
    distanceUnit: preferences.ui.distanceUnit,
  };
  const unitLabel = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const openShare = () =>
    router.push({ pathname: "/share/[kind]/[id]", params: { kind: "session", id } });
  return (
    <Page
      title={session?.title ?? t("session__history")}
      back
      backFallback="/history"
      actions={
        session ? (
          <View className="flex-row">
            <Button variant="ghost" accessibilityLabel={t("share__action")} onPress={openShare}>
              <ShareNetwork color={ink} />
            </Button>
            <Button
              variant="ghost"
              accessibilityLabel={t("session__menu")}
              onPress={() => setMenu(true)}
            >
              <DotsThreeVertical color={ink} />
            </Button>
          </View>
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
            state.status === "loading" ? null : (
              <Text className="font-normal text-body text-muted">{t("session__load_failed")}</Text>
            )
          ) : (
            <>
              <View className="gap-4">
                <Text className="font-normal text-body text-muted">
                  {new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "full",
                    timeStyle: "short",
                    timeZone,
                  }).format(new Date(session.startedAt))}
                </Text>
                {source.status === "ready" ? (
                  <ListSection variant="plain">
                    <ListRow
                      title={t("session__from_workout", {
                        title: source.workout.title ?? t("training__workout"),
                      })}
                      onPress={() =>
                        router.push(
                          { pathname: "/train/workout/[id]", params: { id: source.workout.id } },
                          ANCHORED,
                        )
                      }
                    />
                  </ListSection>
                ) : null}
                <StatTiles
                  items={[
                    {
                      label: t("stats__duration"),
                      value: formatElapsed(sessionDuration(session)),
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
                        recordCount(flags, loggedSetsOf(session, preferences.ui.countWarmups)),
                      ),
                    },
                  ]}
                />
                {session.note ? (
                  <Text className="font-normal text-body text-foreground">{session.note}</Text>
                ) : null}
              </View>
              <SessionPhotos sessionId={id} />
              <MuscleDistribution
                preview
                split
                sets={loggedSetsOf(session, preferences.ui.countWarmups)}
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
                      doneSummary(
                        [{ ...set, kind: "working" }],
                        entry.type,
                        unit,
                        unitLabel,
                        display,
                      ),
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
                        imageMediaId={entry.exercise?.imageMediaId}
                        thumbnailKey={entry.exercise?.thumbnailKey ?? null}
                        onPress={() =>
                          router.push({
                            pathname: "/exercise-view/[id]",
                            params: { id: entry.exerciseId },
                          })
                        }
                      />
                      {entry.note ? (
                        <Text className="font-normal px-1 text-caption text-muted">
                          {entry.note}
                        </Text>
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
                              <Medal color={accentText} size={20} weight="fill" />
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
                    key: "again",
                    label: t("session__perform_again"),
                    icon: ArrowClockwise,
                    onPress: () => void startAgain(id),
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
                            router.push(
                              { pathname: "/train/workout/[id]", params: { id: saved } },
                              ANCHORED,
                            );
                        });
                    },
                  },
                  {
                    key: "share",
                    label: t("share__action"),
                    icon: ShareNetwork,
                    onPress: openShare,
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
              {startSheet}
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
