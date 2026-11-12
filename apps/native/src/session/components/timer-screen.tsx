import {
  MUSCLE_GROUP_KEYS,
  SESSION_LIMITS,
  SET_FIELDS,
  derivedWorkoutTitle,
  type SetKind,
} from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";
import { useFocusEffect } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useThemeColor } from "heroui-native";
import { CaretDown, DotsThreeVertical, Flag, Trash, WarningCircle } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { usePickExercises } from "@/exercise";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Skeleton } from "@/platform/ui/skeleton";
import type { SwipeAction } from "@/platform/ui/swipe-row";
import { SET_TONES, chipTexts } from "@/training";

import { elapsedSeconds, formatElapsed } from "../clock";
import {
  currentAction,
  sessionStats,
  partSeparator,
  valueParts,
  type CurrentSet,
  type DisplayValue,
} from "../current-action";
import { timerView } from "../duration-timer";
import { REST_ADJUST_SECONDS } from "../rest-rules";
import { setRestSurfaceVisible } from "../rest-notification";
import { askRestPermission, markRestPermissionAsked } from "../rest-permission-store";
import { formatVolume } from "../summary";
import { clockTime, padCount, progressStyle } from "../timer-progress";
import { useFinishFlow } from "../use-finish-flow";
import { useNow } from "../use-now";
import { useSession } from "../use-session";
import { useSessionLogging } from "../use-session-logging";
import { RestPermissionSheet } from "./rest-permission-sheet";
import { SessionKeypad, useSessionKeypadAccessory } from "./session-keypad";

const KEEP_AWAKE_TAG = "session-timer";
/** A pull of this many points, or a fast flick, down closes the Timer. */
/** The big clock's size in points; it shrinks to fit when hours show. */
const CLOCK_SIZE = 120;
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 900;

/** Where the Timer sends the user. */
export type TimerScreenProps = {
  id: string;
  /** Back to the sets view; the Session keeps running. */
  onClose: () => void;
  /** The Session is gone (discarded elsewhere): leave. */
  onGone: () => void;
  /** Finished here: show the summary. */
  onFinished: (id: string) => void;
};

/**
 * The full-screen Timer: a second way to log a live Session. One big clock (the Rest countdown, or
 * the time since the last set), the set to log with a Complete set button, and the Session's
 * totals. It logs through the same hooks as the sets view, so a tick here starts a Rest, buzzes
 * and chimes exactly as there.
 */
export function TimerScreen(props: TimerScreenProps) {
  const { t } = useTranslation();
  const state = useSession(props.id);
  useEffect(() => {
    if (state.status === "missing") props.onGone();
  }, [state.status, props]);
  if (state.status === "loading" || state.status === "missing") return <TimerSkeleton />;
  if (state.status === "error") {
    return (
      <View className="flex-1 justify-center gap-4 bg-background p-4">
        <EmptyState icon={WarningCircle} title={t("session__load_failed")} />
        <Button variant="secondary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      </View>
    );
  }
  return <LoadedTimer key={state.session.id} session={state.session} {...props} />;
}

/** The squares (or thin segments) of sets done. */
/** Shown until the Session and its Previous values load: the frame the screen settles into. */
function TimerSkeleton() {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-background px-4"
      style={{ paddingTop: top + 12, paddingBottom: bottom + 12 }}
    >
      <Skeleton label={t("common__loading")} className="h-11 w-full" />
      <View className="flex-1 items-center justify-center">
        <Skeleton className="h-28 w-64" />
      </View>
      <Skeleton className="h-16 w-full" />
    </View>
  );
}

function SetProgress({ done, total }: { done: number; total: number }) {
  const style = progressStyle(total);
  if (style === "bar") {
    return (
      <View className="h-0.5 flex-1 bg-default">
        <View className="h-full bg-foreground" style={{ width: `${(done / total) * 100}%` }} />
      </View>
    );
  }
  const marks = Array.from({ length: total }, (_, index) => index < done);
  return (
    <View className={style === "squares" ? "flex-row gap-1" : "flex-1 flex-row gap-px"}>
      {marks.map((filled, index) => (
        <View
          key={index}
          className={`${style === "squares" ? "h-2 w-2" : "h-0.5 flex-1"} ${filled ? "bg-foreground" : "bg-default"}`}
        />
      ))}
    </View>
  );
}

/** A small keycap: hairline border, an overline label. */
function Keycap({
  label,
  onPress,
  disabled = false,
  grow = 1,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  grow?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-11 items-center justify-center rounded-lg border border-border px-2 active:bg-default ${disabled ? "opacity-40" : ""}`}
      style={{ flexGrow: grow, flexBasis: 0 }}
    >
      <Text
        numberOfLines={1}
        className="text-overline uppercase text-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Stat({ label, value, first }: { label: string; value: string; first: boolean }) {
  return (
    <View className={`flex-1 gap-0.5 px-3 ${first ? "" : "border-l border-border"}`}>
      <Text className="text-overline uppercase text-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className="text-numeric-md text-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

function LoadedTimer({
  session: stored,
  onClose,
  onFinished,
  onGone,
}: TimerScreenProps & { session: SessionDetail }) {
  const { t, i18n } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const {
    session,
    actions,
    preferences,
    setUi,
    unit,
    bodyweightKg,
    installId,
    readOnly,
    exerciseIds,
    historyReady,
    historyFailed,
    logging,
    askOpen,
    setAskOpen,
  } = useSessionLogging(stored);
  const pickExercises = usePickExercises("session");
  const keepAwake = preferences.ui.keepAwake;
  const timeZone = preferences.timezone;

  // Awake while it is in front; the Rest is shown here, so the system banner for it is held back.
  useFocusEffect(
    useCallback(() => {
      setRestSurfaceVisible(true);
      if (keepAwake) void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      return () => {
        setRestSurfaceVisible(false);
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }, [keepAwake]),
  );

  const title = useMemo(() => {
    if (!session.titleDerived) return session.title;
    const muscles = session.exercises.flatMap((entry) =>
      entry.exercise ? [entry.exercise.primaryMuscle] : [],
    );
    return (
      derivedWorkoutTitle(muscles, (muscle) => t(MUSCLE_GROUP_KEYS[muscle])).slice(
        0,
        SESSION_LIMITS.titleMax,
      ) ||
      session.title ||
      t("session__untitled")
    );
  }, [session.titleDerived, session.title, session.exercises, t]);

  const allSets = session.exercises.flatMap((entry) => entry.sets);
  const ticked = allSets.filter((set) => set.completedAt !== null).length;
  const flow = useFinishFlow({
    session,
    title,
    ticked,
    unticked: allSets.length - ticked,
    actions,
    flush: logging.flush,
    closeKeypad: logging.closeKeypad,
    onMinimise: onGone,
    onFinished,
  });

  // ---- What to show ----
  const now = useNow(session.finishedAt === null, 500);
  const [restEndedAt, setRestEndedAt] = useState<number | null>(null);
  const { ghostsFor } = logging;
  const action = useMemo(
    () => currentAction({ session, ghostsFor, now, restEndedAt }),
    [session, ghostsFor, now, restEndedAt],
  );
  // Skip clears the stored Rest, so the moment a Rest stops is kept here to count work from it.
  const phase = action.phase;
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === "rest" && phase === "work") setRestEndedAt(Date.now());
    lastPhase.current = phase;
  }, [phase]);
  const stats = useMemo(
    () => sessionStats({ session, bodyweightKg, now }),
    [session, bodyweightKg, now],
  );

  // Typing in the keypad shows at once; the saved set trails it while writes are coalesced.
  const current = useMemo<CurrentSet | null>(() => {
    const base = action.current;
    if (!base) return null;
    const cell = logging.entry?.cell;
    const typed = logging.typedValue;
    const values: DisplayValue[] = base.values.map((item) =>
      cell && cell.setId === base.setId && cell.field === item.field && typed !== undefined
        ? { ...item, value: typed, ghost: false }
        : item,
    );
    return { ...base, values, empty: values.every((item) => item.value === null) };
  }, [action.current, logging.entry, logging.typedValue]);

  // ---- Actions ----
  const edit = useCallback(() => {
    if (!current || readOnly) return;
    const field = SET_FIELDS[current.type][0];
    if (field) logging.openCell(current.setId, field);
  }, [current, readOnly, logging]);

  // A tick the rules refuse (a value no one has typed and no Ghost has) goes to Edit set.
  const { refusal, openCell } = logging;
  const refusedField = refusal?.setId === current?.setId ? refusal?.fields[0] : undefined;
  useEffect(() => {
    if (refusal && refusedField) openCell(refusal.setId, refusedField);
  }, [refusal, refusedField, openCell]);

  // Complete set only ever ticks: a second tap that lands before the screen has moved on to the
  // next set would otherwise reach the sets view's toggle and untick the set it just ticked.
  const completing = useRef<string | null>(null);
  const complete = async () => {
    if (!current || readOnly || completing.current === current.setId) return;
    if (logging.found.get(current.setId)?.set.completedAt) return;
    if (current.empty) {
      edit();
      return;
    }
    completing.current = current.setId;
    try {
      // A running stopwatch logs what it counted; everything else ticks like the sets view does.
      if (current.timer && current.timer.target === null) await logging.onTimer(current.setId);
      else await logging.onTick(current.setId);
    } finally {
      // The next render has the next set; until then a repeat tap stays ignored.
      setTimeout(() => {
        completing.current = null;
      }, 400);
    }
  };
  const skipRest = () => {
    haptic.tick();
    void actions.skipRest(session.id);
  };
  const nudge = (delta: number) => {
    haptic.tick();
    void actions.nudgeRest(session.id, delta);
  };
  const addExercise = async () => {
    const picked = await pickExercises({ exclude: exerciseIds });
    if (picked && picked.length > 0) await actions.addExercises(session.id, picked);
  };

  // ---- Leaving ----
  const close = useCallback(() => {
    logging.flush();
    setUi({ sessionView: "sets" });
    onClose();
  }, [logging, setUi, onClose]);
  const { closeKeypad, activeSetId } = logging;
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (activeSetId) closeKeypad();
        else close();
        return true;
      });
      return () => subscription.remove();
    }, [activeSetId, closeKeypad, close]),
  );
  const swipeDown = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-24, 24])
    .onEnd((event) => {
      if (event.translationY > CLOSE_DISTANCE || event.velocityY > CLOSE_VELOCITY) {
        scheduleOnRN(close);
      }
    });

  const [menuOpen, setMenuOpen] = useState(false);
  const accessory = useSessionKeypadAccessory(logging, unit);
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");

  // One ready state, as in the sets view: wait for Previous values so Ghosts are right.
  if (installId === null || !(historyReady || historyFailed)) return <TimerSkeleton />;

  const resting = action.phase === "rest" && session.rest !== null;
  const editable = !readOnly && session.finishedAt === null;
  const keypadOpen = logging.entry !== null;
  const lang = i18n.language;

  // The big clock: the Rest countdown, a running set timer, or the time since the last set.
  const duration = current?.timer
    ? timerView(current.timer.startedAt, current.timer.target, now)
    : null;
  const workSeconds = elapsedSeconds(action.workStartedAt, now);
  const bigSeconds = action.rest
    ? action.rest.remaining
    : duration
      ? (duration.remaining ?? duration.elapsed)
      : workSeconds;
  const restProgress =
    action.rest && action.rest.total > 0 ? 1 - action.rest.remaining / action.rest.total : 0;
  const hasDurationField = current
    ? SET_FIELDS[current.type].some((field) => field === "duration")
    : false;
  const canStartSetTimer =
    editable && !resting && current !== null && hasDurationField && current.timer === null;

  const chip = current
    ? chipTexts(
        current.kinds.map((kind) => ({ kind })),
        {
          working: "",
          warmup: t("training__chip_warmup"),
          drop: t("training__chip_drop"),
          failure: t("training__chip_failure"),
          top: t("training__chip_top"),
          backoff: t("training__chip_backoff"),
          myo: t("training__chip_myo"),
        } satisfies Record<SetKind, string>,
      )[current.index]
    : undefined;

  // The values of the set, the cell being edited marked so the keypad has an obvious target.
  const parts = current ? valueParts(current.values, unit, unitName) : [];
  const editing =
    logging.entry && logging.entry.cell.setId === current?.setId ? logging.entry.cell.field : null;
  const valueRow = (
    <View className="flex-row items-center gap-1.5">
      {parts.flatMap((part, index) => {
        const before = parts[index - 1];
        return [
          ...(before
            ? [
                <Text key={`${part.field}-sep`} className="text-body text-muted">
                  {partSeparator(before, part)}
                </Text>,
              ]
            : []),
          <Text
            key={part.field}
            className={`rounded-md px-1.5 text-body text-foreground ${editing === part.field ? "bg-default" : ""}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {part.text}
          </Text>,
        ];
      })}
    </View>
  );

  const primary = action.allDone
    ? { label: t("session__timer_finish"), onPress: flow.askFinish }
    : current === null
      ? { label: t("session__timer_add_exercise"), onPress: () => void addExercise() }
      : resting
        ? { label: t("session__timer_skip_rest"), onPress: skipRest }
        : { label: t("session__timer_complete"), onPress: () => void complete() };

  const menuActions: SwipeAction[] = editable
    ? [
        { key: "finish", label: t("session__timer_finish"), icon: Flag, onPress: flow.askFinish },
        {
          key: "discard",
          label: t("session__discard_workout"),
          icon: Trash,
          tone: "danger",
          onPress: flow.askDiscard,
        },
      ]
    : [];

  return (
    <GestureDetector gesture={swipeDown}>
      <View className="flex-1 bg-background">
        <View className="flex-row items-center gap-2 px-3" style={{ paddingTop: top + 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("session__timer_close")}
            onPress={close}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
          >
            <CaretDown size={22} weight="bold" color={foreground} />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="min-w-0 flex-1 text-center font-semibold text-title-md text-foreground"
          >
            {title}
          </Text>
          {menuActions.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("session__menu")}
              onPress={() => setMenuOpen(true)}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
            >
              <DotsThreeVertical size={22} color={foreground} />
            </Pressable>
          ) : (
            <View className="h-11 w-11" />
          )}
        </View>

        <View className="mt-2 flex-row items-center gap-3 border-b border-border px-5 pb-3">
          <Text className="text-overline uppercase text-muted">
            {t("session__timer_progress_label")}
          </Text>
          <Text className="text-overline text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
            {t("session__timer_progress", {
              done: padCount(action.setsDone),
              total: padCount(action.setsTotal),
            })}
          </Text>
          <SetProgress done={action.setsDone} total={action.setsTotal} />
        </View>

        <View className="flex-1 items-center justify-center gap-3 px-5">
          {action.allDone ? (
            <Text className="text-center font-semibold text-title-xl text-foreground">
              {t("session__timer_all_done")}
            </Text>
          ) : current === null ? (
            <Text className="text-center text-body text-muted">{t("session__timer_no_sets")}</Text>
          ) : (
            <>
              <Text className="text-overline uppercase text-muted">
                {t(resting ? "session__timer_rest_label" : "session__timer_work_label")}
              </Text>
              <Pressable
                accessibilityRole={canStartSetTimer ? "button" : "text"}
                accessibilityLabel={
                  canStartSetTimer ? t("session__timer_start_set_timer") : undefined
                }
                disabled={!canStartSetTimer}
                onPress={() => void logging.onTimer(current.setId)}
              >
                <Text
                  accessibilityLiveRegion="none"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  className="text-center font-semibold text-numeric-hero text-foreground"
                  // Larger than the scale's numeric-hero (72): the clock is the whole point here.
                  style={{
                    fontVariant: ["tabular-nums"],
                    fontSize: CLOCK_SIZE,
                    lineHeight: CLOCK_SIZE + 4,
                    letterSpacing: -3,
                  }}
                >
                  {formatElapsed(bigSeconds)}
                </Text>
              </Pressable>
              {resting && session.rest ? (
                <View className="w-full gap-2">
                  <View
                    accessibilityRole="progressbar"
                    accessibilityLabel={t("session__rest_label")}
                    accessibilityValue={{
                      min: 0,
                      max: action.rest?.total ?? 0,
                      now: (action.rest?.total ?? 0) - (action.rest?.remaining ?? 0),
                    }}
                    className="h-0.5 w-full bg-default"
                  >
                    <View
                      className="h-full bg-foreground"
                      style={{ width: `${Math.round(restProgress * 100)}%` }}
                    />
                  </View>
                  <Text
                    className="text-center text-overline uppercase text-muted"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {t("session__timer_rest_span", {
                      start: clockTime(Date.parse(session.rest.startedAt), lang, timeZone),
                      end: clockTime(Date.parse(session.rest.endsAt), lang, timeZone),
                    })}
                  </Text>
                </View>
              ) : null}
            </>
          )}
          <Text className="text-label text-muted" style={{ fontVariant: ["tabular-nums"] }}>
            {t("session__timer_total", { time: formatElapsed(stats.elapsedS) })}
          </Text>
        </View>

        {current ? (
          <View className="items-center gap-1.5 px-5 pb-5">
            <Text numberOfLines={1} className="font-semibold text-title-md text-foreground">
              {current.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <View
                className={`h-6 min-w-6 items-center justify-center rounded-md px-1 ${current.kind === "working" ? "bg-default" : SET_TONES[current.kind].background}`}
              >
                <Text className={`font-semibold text-caption ${SET_TONES[current.kind].text}`}>
                  {chip || String(current.index + 1)}
                </Text>
              </View>
              <Text className="text-body text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
                {t("session__timer_set_of", { number: current.index + 1, total: current.total })}
              </Text>
              {parts.length > 0 ? <Text className="text-body text-muted">·</Text> : null}
              {valueRow}
            </View>
            {action.next ? (
              <Text numberOfLines={1} className="text-label text-muted">
                {action.next.kind === "exercise"
                  ? t("session__timer_next_exercise", { title: action.next.title })
                  : t("session__timer_next_set", { number: action.next.number })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {keypadOpen ? (
          <SessionKeypad logging={logging} accessory={accessory} />
        ) : (
          <View className="gap-3 px-4" style={{ paddingBottom: bottom + 12 }}>
            <View className="flex-row gap-2">
              <Keycap
                label={t("session__timer_minus", { seconds: REST_ADJUST_SECONDS })}
                disabled={!resting || !editable || action.allDone}
                onPress={() => nudge(-REST_ADJUST_SECONDS)}
                grow={0.8}
              />
              <Keycap
                label={t("session__timer_plus", { seconds: REST_ADJUST_SECONDS })}
                disabled={!resting || !editable || action.allDone}
                onPress={() => nudge(REST_ADJUST_SECONDS)}
                grow={0.8}
              />
              <Keycap
                label={t("session__timer_edit_set")}
                disabled={current === null || !editable}
                onPress={edit}
                grow={1.1}
              />
              <Keycap
                label={t("session__timer_add_exercise")}
                disabled={
                  !editable || session.exercises.length >= SESSION_LIMITS.exercisesPerSession
                }
                onPress={() => void addExercise()}
                grow={1.4}
              />
            </View>
            <Button
              variant="primary"
              className="h-16 w-full rounded-2xl"
              isDisabled={!editable && !action.allDone}
              onPress={primary.onPress}
            >
              <Button.Label className="font-semibold text-title-md">{primary.label}</Button.Label>
            </Button>
            <View className="flex-row border-t border-border pt-3">
              <Stat
                first
                label={t("session__stat_volume")}
                value={`${formatVolume(stats.volumeKg, unit, lang)} ${unitName}`}
              />
              <Stat
                first={false}
                label={t("session__stat_sets")}
                value={`${stats.setsDone}/${stats.setsTotal}`}
              />
              <Stat
                first={false}
                label={t("session__timer_stat_time")}
                value={formatElapsed(stats.elapsedS)}
              />
              <Stat
                first={false}
                label={t("session__timer_stat_avg_rest")}
                value={stats.averageRestS === null ? "–" : formatElapsed(stats.averageRestS)}
              />
            </View>
          </View>
        )}

        <ActionSheet
          isOpen={menuOpen}
          onOpenChange={setMenuOpen}
          title={title}
          actions={menuActions}
        />
        {flow.sheets}
        <RestPermissionSheet
          isOpen={askOpen}
          onOpenChange={setAskOpen}
          onAllow={() => {
            setAskOpen(false);
            void askRestPermission();
          }}
          onDecline={() => {
            markRestPermissionAsked();
            setAskOpen(false);
          }}
        />
      </View>
    </GestureDetector>
  );
}
