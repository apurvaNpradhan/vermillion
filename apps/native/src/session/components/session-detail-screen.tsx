import { SessionRecord } from "./session-record";
import { SET_KIND_KEYS, recordFlags, sessionTotals } from "@workspace/shared";
import { useRouter } from "expo-router";
import {
  DotsThreeVertical,
  PencilSimple,
  ShareNetwork,
  Trash,
  FloppyDisk,
} from "phosphor-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { Page } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { useWorkout } from "@/training";
import { formatElapsed } from "../clock";
import { loggedSetsOf } from "../set-values";
import { doneSummary, formatVolume } from "../summary";
import { useSession } from "../use-session";
import { useSessionActions } from "../use-session-actions";
import { useFinishSession } from "../use-finish-session";
import { useSessionHistory } from "../use-session-history";

export function SessionDetailScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const state = useSession(id);
  const session = state.status === "ready" ? state.session : null;
  const source = useWorkout(session?.workoutId ?? "");
  const { preferences } = usePreferences();
  const actions = useSessionActions();
  const finish = useFinishSession();
  const history = useSessionHistory();
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
      actions={
        session ? (
          <Button
            variant="ghost"
            accessibilityLabel={t("session__menu")}
            onPress={() => setMenu(true)}
          >
            <DotsThreeVertical />
          </Button>
        ) : undefined
      }
    >
      {({ header, contentContainerStyle, ...scroll }) => (
        <Animated.ScrollView
          {...scroll}
          contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16, gap: 16 }}
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
              <Text className="text-body text-muted">
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "full",
                  timeStyle: "short",
                  timeZone: preferences.timezone ?? undefined,
                }).format(new Date(session.startedAt))}
              </Text>
              {source.status === "ready" ? (
                <Button
                  variant="ghost"
                  onPress={() =>
                    router.push({
                      pathname: "/train/workout/[id]",
                      params: { id: source.workout.id },
                    })
                  }
                >
                  <Button.Label>
                    {source.workout.title ?? t("session__source_workout")}
                  </Button.Label>
                </Button>
              ) : null}
              <Text className="text-body text-foreground">{stats}</Text>
              {session.note ? (
                <Text className="text-body text-foreground">{session.note}</Text>
              ) : null}
              <MuscleDistribution
                preview
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
              {session.exercises.map((entry) => (
                <View key={entry.id} className="gap-2 rounded-xl bg-surface p-4">
                  <Text className="text-title-md text-foreground">{entry.title}</Text>
                  {entry.note ? <Text className="text-body text-muted">{entry.note}</Text> : null}
                  {entry.sets.map((set) => (
                    <View key={set.id}>
                      <Text className="text-body text-foreground">
                        {t("session__detail_set", {
                          kind: t(SET_KIND_KEYS[set.kind]),
                          values: doneSummary(
                            [{ ...set, kind: "working" }],
                            entry.type,
                            unit,
                            unitLabel,
                          ),
                        })}
                      </Text>
                      {set.rpe !== null ? (
                        <Text className="text-caption text-muted">
                          {t("session__share_effort", { value: set.rpe })}
                        </Text>
                      ) : null}
                      {flags.has(set.id) ? (
                        <SessionRecord
                          key={set.id}
                          exercise={entry.title}
                          records={flags.get(set.id) ?? []}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
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
              <ConfirmationDialog
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
