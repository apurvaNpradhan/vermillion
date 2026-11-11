import { useFocusEffect, useRouter } from "expo-router";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { useIdentityColor, useOnIdentityColor } from "@/platform/theme";
import { haptic } from "@/platform/haptics";
import { SessionRecord } from "./session-record";
import { useForm } from "@tanstack/react-form";
import {
  diffSessionAgainstWorkout,
  recordFlags,
  sessionTotals,
  SESSION_LIMITS,
  SET_KIND_KEYS,
} from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";
import { useCallback, useEffect, useState } from "react";
import { useThemeColor } from "heroui-native";
import { BackHandler, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { usePreferences } from "@/preferences";
import { useWorkout } from "@/training";
import { formatElapsed } from "../clock";
import { formatCell, loggedSetsOf } from "../set-values";
import { formatVolume } from "../summary";
import { useSession } from "../use-session";
import { useSessionActions } from "../use-session-actions";
import { useFinishSession } from "../use-finish-session";
import { useRecordHistory } from "../use-session-history";
import { useSoundCues } from "../use-sound-cues";

export function SessionSummaryScreen({ id, onDone }: { id: string; onDone: () => void }) {
  const state = useSession(id);
  const { t } = useTranslation();
  if (state.status !== "ready")
    return (
      <View className="flex-1 justify-center bg-background p-4">
        <Text className="text-body text-foreground">
          {t(state.status === "loading" ? "common__loading" : "session__load_failed")}
        </Text>
        <Button onPress={state.status === "error" ? state.retry : onDone}>
          <Button.Label>{t("session__done")}</Button.Label>
        </Button>
      </View>
    );
  return <FinishFlow session={state.session} onDone={onDone} />;
}

function FinishFlow({ session, onDone }: { session: SessionDetail; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const source = useWorkout(session.workoutId ?? "");
  const actions = useSessionActions();
  const finish = useFinishSession();
  const history = useRecordHistory(session.exercises.map((entry) => entry.exerciseId));
  const [step, setStep] = useState<"summary" | "workout" | "celebration">("summary");
  const { play } = useSoundCues();
  useEffect(() => {
    if (step !== "celebration") return;
    haptic.success();
    play("finished");
  }, [step, play]);
  const router = useRouter();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const backToWorkout = useCallback(() => {
    router.replace({ pathname: "/session/[id]", params: { id: session.id } });
  }, [router, session.id]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        if (step === "summary" && session.finishedAt === null) backToWorkout();
        else onDone();
        return true;
      });
      return () => listener.remove();
    }, [step, session.finishedAt, backToWorkout, onDone]),
  );
  const [structure, setStructure] = useState(false);
  const [targets, setTargets] = useState(false);
  const [saveNew, setSaveNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const diff =
    source.status === "ready"
      ? diffSessionAgainstWorkout(session, source.workout)
      : { structure: [], targets: [] };
  const needsWorkout =
    session.workoutId !== null &&
    (source.status === "missing" || diff.structure.length > 0 || diff.targets.length > 0);
  const totals = sessionTotals(loggedSetsOf(session), preferences.ui.bodyweightKg);
  const unit = preferences.ui.weightUnit;
  const unitLabel = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const stats = t("session__share_stats", {
    sets: totals.sets,
    volume: formatVolume(totals.volume, unit, i18n.language),
    unit: unitLabel,
    duration: formatElapsed(
      session.durationS ??
        Math.max(
          0,
          (Date.parse(session.finishedAt ?? new Date().toISOString()) -
            Date.parse(session.startedAt)) /
            1000,
        ),
    ),
  });
  const records = recordFlags(
    [
      ...history.sessions.filter((item) => item.id !== session.id),
      {
        id: session.id,
        started_at: session.startedAt,
        finished_at: session.finishedAt ?? new Date().toISOString(),
        sets: loggedSetsOf(session),
      },
    ],
    preferences.ui.bodyweightKg,
  );
  const [baseline] = useState({
    title: session.title,
    note: session.note ?? "",
    startedAt: session.startedAt,
    duration: String(
      session.durationS ??
        Math.floor(
          (Date.parse(session.finishedAt ?? new Date().toISOString()) -
            Date.parse(session.startedAt)) /
            1000,
        ),
    ),
  });
  const form = useForm({
    defaultValues: baseline,
    onSubmit: async ({ value }) => {
      const duration = Number(value.duration);
      const started = Date.parse(value.startedAt);
      if (
        !value.title.trim() ||
        !Number.isFinite(started) ||
        !Number.isInteger(duration) ||
        duration < 0 ||
        duration > SESSION_LIMITS.durationMaxSeconds ||
        started > Date.now()
      ) {
        setInvalid(true);
        return;
      }
      setBusy(true);
      const input = {
        title: value.title.trim(),
        note: value.note || null,
        startedAt: new Date(started).toISOString(),
        durationSeconds: duration,
        finishedAt: new Date(started + duration * 1000).toISOString(),
      };
      const result =
        session.finishedAt === null
          ? await actions.finish(session.id, input)
          : await finish.edit(session.id, {
              ...(value.title !== baseline.title ? { title: input.title } : {}),
              ...(value.note !== baseline.note ? { note: input.note } : {}),
              ...(value.startedAt !== baseline.startedAt ? { startedAt: input.startedAt } : {}),
              ...(value.duration !== baseline.duration
                ? { durationSeconds: input.durationSeconds }
                : {}),
            });
      setBusy(false);
      if (result) setStep(needsWorkout ? "workout" : "celebration");
    },
  });
  const names = (id: string) =>
    session.exercises.find((entry) => entry.exerciseId === id)?.title ??
    (source.status === "ready"
      ? source.workout.exercises.find((entry) => entry.exerciseId === id)?.exercise?.title
      : null) ??
    t("training__exercise_missing");
  return (
    <ScrollView
      className="flex-1 bg-background"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: top + 16,
        paddingBottom: bottom + 24,
        paddingHorizontal: 16,
        gap: 16,
      }}
    >
      <Text accessibilityRole="header" className="text-title-lg font-semibold text-foreground">
        {t(
          step === "summary"
            ? "session__summary_title"
            : step === "workout"
              ? "session__update_workout"
              : "session__celebration",
        )}
      </Text>
      <Text className="text-body text-foreground">{stats}</Text>
      {session.exercises.flatMap((entry) =>
        entry.sets.flatMap((set) =>
          records.has(set.id)
            ? [
                <SessionRecord
                  key={set.id}
                  exercise={entry.title}
                  records={records.get(set.id) ?? []}
                />,
              ]
            : [],
        ),
      )}
      {source.status === "error" ? (
        <Button variant="secondary" onPress={source.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
      {step === "summary" ? (
        <>
          <form.Field name="title">
            {(field) => (
              <Field
                label={t("session__edit_title")}
                value={field.state.value}
                onChangeText={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="note">
            {(field) => (
              <Field
                label={t("session__edit_note")}
                value={field.state.value}
                onChangeText={field.handleChange}
                multiline
              />
            )}
          </form.Field>
          <form.Field name="startedAt">
            {(field) => (
              <Field
                label={t("session__edit_start")}
                description={t("session__date_hint")}
                value={field.state.value}
                onChangeText={field.handleChange}
                autoCapitalize="none"
              />
            )}
          </form.Field>
          <form.Field name="duration">
            {(field) => (
              <Field
                label={t("session__edit_duration")}
                value={field.state.value}
                onChangeText={field.handleChange}
                keyboardType="number-pad"
              />
            )}
          </form.Field>
          <Text className="text-body text-muted">
            {t("session__finish_unticked", {
              count: session.exercises.reduce(
                (sum, entry) => sum + entry.sets.filter((set) => set.completedAt === null).length,
                0,
              ),
            })}
          </Text>
          {invalid ? (
            <Text accessibilityRole="alert" className="text-body text-danger">
              {t("session__invalid_summary")}
            </Text>
          ) : null}
          {session.finishedAt === null ? (
            <Button variant="secondary" isDisabled={busy} onPress={backToWorkout}>
              <Button.Label>{t("session__back_to_workout")}</Button.Label>
            </Button>
          ) : null}
          <Button
            isDisabled={
              busy ||
              (session.workoutId !== null &&
                (source.status === "loading" || source.status === "error"))
            }
            onPress={() => void form.handleSubmit()}
          >
            <Button.Label>{t("session__save_continue")}</Button.Label>
          </Button>
          {session.finishedAt === null ? (
            <Button variant="danger-soft" isDisabled={busy} onPress={() => setConfirmDiscard(true)}>
              <Button.Label>{t("session__discard_workout")}</Button.Label>
            </Button>
          ) : null}
        </>
      ) : step === "workout" ? (
        <>
          {source.status === "missing" ? (
            <Toggle label={t("session__save_new_workout")} value={saveNew} onChange={setSaveNew} />
          ) : (
            <>
              <Toggle
                label={t("session__update_structure")}
                value={structure}
                onChange={setStructure}
              />
              {diff.structure.map((change, index) => (
                <Text key={index} className="text-body text-foreground">
                  {t(`session__diff_${change.kind}`, {
                    exercise: names(change.exerciseId),
                    before: change.beforeSets?.map((kind) => t(SET_KIND_KEYS[kind])).join(", "),
                    after: change.afterSets?.map((kind) => t(SET_KIND_KEYS[kind])).join(", "),
                  })}
                </Text>
              ))}
              <Toggle label={t("session__update_targets")} value={targets} onChange={setTargets} />
              {diff.targets.map((change) => (
                <Text key={change.workoutExerciseId} className="text-body text-foreground">
                  {t("session__diff_weight", {
                    exercise: names(change.exerciseId),
                    before: change.before
                      .map((weight) =>
                        weight === null
                          ? t("session__no_target")
                          : formatCell("weight", weight, unit),
                      )
                      .join(", "),
                    after: change.after
                      .map((weight) =>
                        weight === null
                          ? t("session__no_target")
                          : formatCell("weight", weight, unit),
                      )
                      .join(", "),
                    unit: unitLabel,
                  })}
                </Text>
              ))}
            </>
          )}
          <Button
            isDisabled={busy}
            onPress={async () => {
              setBusy(true);
              const ok =
                (!structure && !targets && !saveNew) ||
                (await finish.applyWorkout(session.id, { structure, targets, saveNew }));
              setBusy(false);
              if (ok) setStep("celebration");
            }}
          >
            <Button.Label>{t("session__save_continue")}</Button.Label>
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onPress={() => void finish.share(session, stats)}>
            <Button.Label>{t("session__share_text")}</Button.Label>
          </Button>
          <Button onPress={onDone}>
            <Button.Label>{t("session__done")}</Button.Label>
          </Button>
        </>
      )}
      <ConfirmationDialog
        isOpen={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t("session__discard_confirm_title")}
        description={t("session__discard_confirm_body", {
          count: session.exercises.reduce(
            (sum, entry) => sum + entry.sets.filter((set) => set.completedAt !== null).length,
            0,
          ),
        })}
        cancelLabel={t("session__keep_logging")}
        confirmLabel={t("session__discard_workout")}
        destructive
        onConfirm={() => {
          if (busy) return;
          setBusy(true);
          void actions.discard(session.id, session.title).then((ok) => {
            setBusy(false);
            if (ok) onDone();
          });
        }}
      />
    </ScrollView>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const identity = useIdentityColor();
  const field = useThemeColor("field");
  const thumb = useOnIdentityColor();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-body text-foreground">{label}</Text>
      <Switch
        trackColor={{ false: field, true: identity }}
        thumbColor={thumb}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}
