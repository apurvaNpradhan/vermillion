import { useFocusEffect, useRouter } from "expo-router";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { ListRow, ListSection } from "@/platform/ui/list";
import { haptic } from "@/platform/haptics";
import { SessionRecord } from "./session-record";
import { useForm } from "@tanstack/react-form";
import { CalendarBlank, CaretLeft } from "phosphor-react-native";
import {
  diffSessionAgainstWorkout,
  recordFlags,
  sessionTotals,
  SESSION_LIMITS,
  TRAINING_LIMITS,
  SET_KIND_KEYS,
} from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";
import { useCallback, useRef, useState } from "react";
import { useThemeColor } from "heroui-native";
import { BackHandler, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
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
import { joinDuration, notAfter, splitDuration } from "../save-time";
import { DateSheet, DurationSheet } from "./save-time-sheets";
import { UpdateRoutineSheet, type RoutineUpdate } from "./update-routine-sheet";

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
  const { play } = useSoundCues();
  const { toast } = useAppToast();
  const [muted, foreground] = useThemeColor(["muted", "foreground"]);
  const router = useRouter();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const closed = useRef(false);
  const backToWorkout = useCallback(() => {
    router.replace({ pathname: "/session/[id]", params: { id: session.id } });
  }, [router, session.id]);
  /** The save is done: a haptic, the finished cue and a toast, then leave the screen. */
  const complete = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    haptic.success();
    play("finished");
    toast.show({ label: t("session__saved_toast") });
    onDone();
  }, [play, toast, t, onDone]);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const diff =
    source.status === "ready"
      ? diffSessionAgainstWorkout(session, source.workout)
      : { structure: [], targets: [] };
  const needsWorkout =
    session.workoutId !== null &&
    (source.status === "missing" || diff.structure.length > 0 || diff.targets.length > 0);
  const keepOriginal = useCallback(() => {
    setUpdateOpen(false);
    complete();
  }, [complete]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        if (updateOpen) keepOriginal();
        else if (session.finishedAt === null) backToWorkout();
        else onDone();
        return true;
      });
      return () => listener.remove();
    }, [updateOpen, keepOriginal, session.finishedAt, backToWorkout, onDone]),
  );
  const totals = sessionTotals(loggedSetsOf(session), preferences.ui.bodyweightKg);
  const unit = preferences.ui.weightUnit;
  const unitLabel = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
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
  const recordCount = records.values().reduce((sum, keys) => sum + keys.length, 0);
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
      setInvalid(false);
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
      if (!result) return;
      if (needsWorkout) setUpdateOpen(true);
      else complete();
    },
  });
  const names = (id: string) =>
    session.exercises.find((entry) => entry.exerciseId === id)?.title ??
    (source.status === "ready"
      ? source.workout.exercises.find((entry) => entry.exerciseId === id)?.exercise?.title
      : null) ??
    t("training__exercise_missing");
  const structureLines = diff.structure.map((change) =>
    t(`session__diff_${change.kind}`, {
      exercise: names(change.exerciseId),
      before: change.beforeSets?.map((kind) => t(SET_KIND_KEYS[kind])).join(", "),
      after: change.afterSets?.map((kind) => t(SET_KIND_KEYS[kind])).join(", "),
    }),
  );
  const weightText = (weight: number | null) =>
    weight === null ? t("session__no_target") : formatCell("weight", weight, unit);
  const targetLines = diff.targets.map((change) =>
    t("session__diff_weight", {
      exercise: names(change.exerciseId),
      before: change.before.map(weightText).join(", "),
      after: change.after.map(weightText).join(", "),
      unit: unitLabel,
    }),
  );
  const applyUpdate = async (update: RoutineUpdate) => {
    setBusy(true);
    const ok =
      (!update.structure && !update.targets && !update.saveNew) ||
      (await finish.applyWorkout(session.id, update));
    setBusy(false);
    if (ok) {
      setUpdateOpen(false);
      complete();
    }
  };
  const inputStyle = { padding: 0, margin: 0 };
  const canSave =
    !busy &&
    !updateOpen &&
    !(session.workoutId !== null && (source.status === "loading" || source.status === "error"));
  const unticked = session.exercises.reduce(
    (sum, entry) => sum + entry.sets.filter((set) => set.completedAt === null).length,
    0,
  );
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: top }}>
      <View className="h-14 flex-row items-center gap-3 px-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            session.finishedAt === null ? "session__back_to_workout" : "common__close",
          )}
          hitSlop={8}
          className="size-11 items-center justify-center"
          onPress={session.finishedAt === null ? backToWorkout : onDone}
        >
          <CaretLeft size={24} color={foreground} />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="flex-1 text-center font-semibold text-title-md text-foreground"
        >
          {t("session__save_title")}
        </Text>
        <Button
          size="sm"
          className="rounded-full px-5"
          isDisabled={!canSave}
          onPress={() => void form.handleSubmit()}
        >
          <Button.Label>{t("common__save")}</Button.Label>
        </Button>
      </View>
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: bottom + 24, gap: 24 }}
      >
        <View className="gap-3 px-4">
          <form.Field name="title">
            {(field) => (
              <TextInput
                accessibilityLabel={t("session__edit_title")}
                placeholder={t("session__edit_title")}
                placeholderTextColor={muted}
                value={field.state.value}
                onChangeText={field.handleChange}
                maxLength={TRAINING_LIMITS.titleMax}
                className="font-semibold text-title-lg text-foreground"
                style={inputStyle}
              />
            )}
          </form.Field>
          <form.Field name="note">
            {(field) => (
              <TextInput
                accessibilityLabel={t("session__edit_note")}
                placeholder={t("session__save_note_placeholder")}
                placeholderTextColor={muted}
                value={field.state.value}
                onChangeText={field.handleChange}
                multiline
                textAlignVertical="top"
                className="min-h-16 text-body text-foreground"
                style={inputStyle}
              />
            )}
          </form.Field>
        </View>
        <form.Subscribe selector={(state) => state.values.duration}>
          {(duration) => (
            <View className="flex-row gap-8 border-y border-separator px-4 py-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t("session__stat_duration")}, ${formatElapsed(Number(duration))}`}
                hitSlop={8}
                className="gap-0.5"
                onPress={() => setDurationOpen(true)}
              >
                <Text className="text-caption text-muted">{t("session__stat_duration")}</Text>
                <Text
                  className="font-semibold text-title-md text-identity"
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {formatElapsed(Number(duration))}
                </Text>
              </Pressable>
              <Stat
                label={t("session__stat_volume")}
                value={`${formatVolume(totals.volume, unit, i18n.language)} ${unitLabel}`}
              />
              <Stat label={t("session__stat_sets")} value={String(totals.sets)} />
              {recordCount > 0 ? (
                <Stat label={t("session__stat_records")} value={String(recordCount)} />
              ) : null}
            </View>
          )}
        </form.Subscribe>
        {recordCount > 0 ? (
          <View className="gap-1 px-4">
            <Text
              accessibilityRole="header"
              className="font-semibold text-title-md text-foreground"
            >
              {t("session__stat_records")}
            </Text>
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
          </View>
        ) : null}
        <View className="px-4">
          <form.Subscribe selector={(state) => state.values.startedAt}>
            {(startedAt) => (
              <ListSection variant="plain">
                <ListRow
                  icon={CalendarBlank}
                  title={t("session__row_date")}
                  value={new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(startedAt))}
                  onPress={() => setDateOpen(true)}
                />
              </ListSection>
            )}
          </form.Subscribe>
        </View>
        {source.status === "error" ? (
          <View className="px-4">
            <Button variant="secondary" onPress={source.retry}>
              <Button.Label>{t("training__retry")}</Button.Label>
            </Button>
          </View>
        ) : null}
        <View className="gap-3 px-4">
          <Text className="text-body text-muted">
            {t("session__finish_unticked", { count: unticked })}
          </Text>
          {invalid ? (
            <Text accessibilityRole="alert" className="text-body text-danger">
              {t("session__invalid_summary")}
            </Text>
          ) : null}
        </View>
        {session.finishedAt === null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("session__discard_workout")}
            disabled={busy}
            className="min-h-11 items-center justify-center"
            onPress={() => setConfirmDiscard(true)}
          >
            <Text className="font-medium text-body text-danger">
              {t("session__discard_workout")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <form.Subscribe selector={(state) => state.values.duration}>
        {(duration) => (
          <DurationSheet
            isOpen={durationOpen}
            onOpenChange={setDurationOpen}
            seconds={Number(duration)}
            maxSeconds={SESSION_LIMITS.durationMaxSeconds}
            onChange={(seconds) => {
              const { hours, minutes } = splitDuration(seconds);
              form.setFieldValue(
                "duration",
                String(joinDuration(hours, minutes, SESSION_LIMITS.durationMaxSeconds)),
              );
            }}
          />
        )}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.values.startedAt}>
        {(startedAt) => (
          <DateSheet
            isOpen={dateOpen}
            onOpenChange={setDateOpen}
            startedAt={notAfter(new Date(startedAt), new Date())}
            now={new Date()}
            language={i18n.language}
            onChange={(date) => form.setFieldValue("startedAt", date.toISOString())}
          />
        )}
      </form.Subscribe>
      <UpdateRoutineSheet
        isOpen={updateOpen}
        title={source.status === "ready" ? (source.workout.title ?? session.title) : session.title}
        missing={source.status === "missing"}
        structureLines={structureLines}
        targetLines={targetLines}
        busy={busy}
        onApply={(update) => void applyUpdate(update)}
        onKeep={keepOriginal}
      />
      <ConfirmSheet
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
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-caption text-muted">{label}</Text>
      <Text
        className="font-semibold text-title-md text-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}
