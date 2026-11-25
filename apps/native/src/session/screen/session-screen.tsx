import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { InstantSheets } from "@/platform/ui/sheet-motion";
import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { SessionSettingsSheet } from "@/session/settings/session-settings-sheet";
import { SheetShell } from "@/session/shared/sheet-shell";
import {
  MUSCLE_GROUP_KEYS,
  SESSION_LIMITS,
  derivedWorkoutTitle,
  snapshotModifiers,
  loadCutRange,
  type SetKind,
  resolveExerciseUnit,
  SET_FIELDS,
} from "@workspace/shared";
import type { SessionDetail, SessionExerciseDetail } from "@workspace/sync";
import { useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useThemeColor } from "heroui-native";
import {
  FireSimple,
  Gauge,
  GearSix,
  Info,
  Person,
  Link,
  LinkBreak,
  NotePencil,
  Barbell,
  Plus,
  PushPin,
  Swap,
  Trash,
  WarningCircle,
} from "phosphor-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, ScrollView, Text, View } from "react-native";
import { LayoutAnimationConfig, useAnimatedRef } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ExerciseThumbnail,
  ExerciseUnitSheet,
  useExerciseActions,
  useExerciseUnitOptions,
  usePickExercises,
} from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { useReduceMotion } from "@/platform/ui/use-reduce-motion";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { Button } from "@/platform/ui/button";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";
import { EmptyState } from "@/platform/ui/empty-state";
import { useDismissSwipeRows, type SwipeAction } from "@/platform/ui/swipe-row";
import { CompactRow, ReorderView, SetTypeSheet, supportsWarmups } from "@/training";

import { setRestSurfaceVisible } from "@/session/notifications/rest-notification";
import {
  askNotificationPermission,
  markNotificationPermissionAsked,
} from "@/platform/notifications/permission-store";
import { formatVolume } from "@/session/finish/summary";
import { blockOf } from "@/session/logging/blocks";
import { useAccordionScroll } from "@/session/logging/use-accordion-scroll";
import { afterLayout, useRowReveal } from "@/session/logging/use-row-reveal";
import { canAddWarmups } from "@/session/warmups/warmup-plan";
import { useStableHandler } from "@/session/shared/use-stable-handler";
import { useFinishFlow } from "@/session/finish/use-finish-flow";
import { useFedSessionStore, useSessionLoggingIn } from "@/session/logging/use-session-logging";
import { useSession } from "./use-session";
import { loggedSetsOf } from "@/session/logging/set-values";
import { ExerciseItem, type ExerciseHandlers } from "@/session/sets/exercise-item";
import type { SessionStore } from "@/session/store/session-store";
import { SessionStoreProvider, useSessionStore } from "@/session/store/session-store-context";
import { NoteSheet } from "@/session/sets/note-sheet";
import { SessionEffortSheet } from "@/session/sets/effort-sheet";
import { OwnershipBanner } from "./ownership-banner";
import { RestBar } from "@/session/rest/rest-bar";
import { RestPermissionSheet } from "@/session/notifications/rest-permission-sheet";
import { LoadLimitsSheet } from "@/gym";
import { SessionHeader } from "./session-header";
import { ClockSheet } from "@/session/clock/clock-sheet";
import { firstTickedAt } from "@/session/clock/clock-view";
import { SessionKeypad, useSessionKeypadAccessory } from "@/session/sets/session-keypad";

const KEEP_AWAKE_TAG = "session";

/** Most rows are closed, with the expanded height measured by LegendList. */
const ESTIMATED_CLOSED_HEIGHT = 72;

const exerciseKey = (id: string) => id;

/** Where the screen sends the user. */
export type SessionScreenProps = {
  id: string;
  /** Minimise: back to the tabs, the Session stays active. */
  onMinimise: () => void;
  /** The Session is gone (discarded elsewhere): leave. */
  onGone: () => void;
  /** Finished here: show the summary. */
  onFinished: (id: string) => void;
};

/**
 * The logging screen of one Session: a windowed list of expanded exercises, the set
 * grid, the custom keypad, and the header with the clock and totals. A Session another device
 * owns is read-only here until taken over. Everything comes through the module hooks.
 */
export function SessionScreen(props: SessionScreenProps) {
  const { t } = useTranslation();
  const state = useSession(props.id);
  useEffect(() => {
    if (state.status === "missing") props.onGone();
  }, [state.status, props]);

  if (state.status === "loading" || state.status === "missing") return <SessionBlank />;
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
  return (
    <InstantSheets value>
      <SessionHost key={state.session.id} stored={state.session} {...props} />
    </InstantSheets>
  );
}

/** The screen's own background while the Session reads from the device (milliseconds). */
function SessionBlank() {
  return <View className="flex-1 bg-background" />;
}

/** Makes the store of the open Session and feeds it from the watch. It is the only part that follows each emission. */
function SessionHost({ stored, ...props }: SessionScreenProps & { stored: SessionDetail }) {
  const store = useFedSessionStore(stored);
  return (
    <SessionStoreProvider store={store}>
      <LayoutAnimationConfig skipEntering skipExiting>
        <View className="flex-1 bg-background" collapsable={false}>
          <LoadedSession store={store} {...props} />
        </View>
      </LayoutAnimationConfig>
    </SessionStoreProvider>
  );
}

type Sheet =
  | { kind: "menu"; exercise: SessionExerciseDetail }
  | { kind: "note"; exercise: SessionExerciseDetail }
  | { kind: "pinned"; exercise: SessionExerciseDetail }
  | { kind: "limits"; exercise: SessionExerciseDetail }
  | { kind: "unit"; exercise: SessionExerciseDetail }
  | { kind: "swap"; exercise: SessionExerciseDetail; next: string }
  | { kind: "set-kind"; setId: string }
  | { kind: "effort"; setId: string };

const LoadedSession = memo(function LoadedSession({
  store,
  onMinimise,
  onFinished,
}: SessionScreenProps & { store: SessionStore }) {
  const { t, i18n } = useTranslation();
  const phaseText = usePhaseText();
  const foreground = useThemeColor("foreground");
  const router = useRouter();
  const {
    session,
    sessionGymId,
    actions,
    preferences,
    unit,
    effortScale,
    installId,
    mine,
    hadIt,
    readOnly,
    exerciseIds,
    historyFailed,
    retryHistory,
    logging,
    addWarmups,
    askOpen,
    setAskOpen,
  } = useSessionLoggingIn(store, true);
  const stats = useSessionStore((state) => state.stats);
  const exerciseKeys = useSessionStore((state) => state.exerciseIds);
  // Which exercises are open: the list sizes closed and open items apart (see `getItemType`).
  const { toast } = useAppToast();
  const viewExercise = useCallback(
    (id: string) =>
      router.push({ pathname: "/exercise-view/[id]", params: { id, sessionId: session.id } }),
    [router, session.id],
  );
  const pickExercises = usePickExercises("session");
  const scrollRef = useRef<LegendListRef>(null);
  const dismissSwipeRows = useDismissSwipeRows();
  const accordionScroll = useAccordionScroll(store, scrollRef);
  const isEditing = useCallback((setId: string) => store.getState().cell?.setId === setId, [store]);
  const reveal = useRowReveal(scrollRef, isEditing);
  const reducedMotion = useReduceMotion();
  const focused = useIsFocused();
  const animate = focused && !reducedMotion && session.finishedAt === null;
  const viewport = useAnimatedRef<View>();
  const revealViewport = reveal.viewportRef;
  const attachViewport = useCallback(
    (node: View | null) => {
      revealViewport.current = node;
      viewport(node);
    },
    [revealViewport, viewport],
  );
  const listHeaderHeight = useRef(0);
  const onListMetrics = useCallback(({ headerSize }: { headerSize: number }) => {
    listHeaderHeight.current = headerSize;
  }, []);
  const isInViewport = useCallback((exerciseId: string, offset: number, height: number) => {
    const state = scrollRef.current?.getState();
    const position = state?.positionByKey(exerciseId);
    if (!state || position === undefined || height <= 0) return false;
    const top = position + listHeaderHeight.current + offset - state.scroll;
    return top < state.scrollLength && top + height > 0;
  }, []);
  const [reordering, setReordering] = useState(false);
  const { bottom } = useSafeAreaInsets();

  const { closeKeypad, flushWrites } = logging;
  const openReorder = useCallback(() => {
    if (readOnly) return;
    closeKeypad();
    setReordering(true);
  }, [closeKeypad, readOnly]);
  useEffect(() => {
    if (readOnly) setReordering(false);
  }, [readOnly]);
  // The screen stays awake while it is in front (a preference); a Rest is shown here, so the
  // system banner for it is held back meanwhile.
  const keepAwake = preferences.ui.keepAwake;
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

  // The title follows the exercises until the user renames the Session.
  const derivedTitle = useMemo(() => {
    const muscles = session.exercises.flatMap((entry) =>
      entry.exercise ? [entry.exercise.primaryMuscle] : [],
    );
    return (
      derivedWorkoutTitle(muscles, (muscle) => t(MUSCLE_GROUP_KEYS[muscle])).slice(
        0,
        SESSION_LIMITS.titleMax,
      ) || t("session__untitled")
    );
  }, [session.exercises, t]);
  const title = session.titleDerived ? derivedTitle : session.title;
  const { refreshDerivedTitle } = actions;
  useEffect(() => {
    if (!readOnly && session.titleDerived && session.title !== derivedTitle) {
      void refreshDerivedTitle(session.id, derivedTitle);
    }
  }, [
    readOnly,
    session.titleDerived,
    session.title,
    session.id,
    derivedTitle,
    refreshDerivedTitle,
  ]);

  const { setUnit } = useExerciseActions();
  const unitLabels = useExerciseUnitOptions(unit);
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const volume = `${formatVolume(stats.volume, unit, i18n.language)} ${unitName}`;
  // The banner reads the modifiers the Session started with, not the Program's plan now.
  const views = useSessionStore((state) => state.views);
  const phaseBanner = (() => {
    if (session.phase === null) return null;
    const { modifiers, testTop } = snapshotModifiers(session.phase, session.phaseModifiers);
    const hasEffort = session.exercises.some((entry) =>
      entry.sets.some((set) => set.target?.effort_min !== undefined),
    );
    const factors = [...views.values()].flatMap(
      ({ suggestion }) =>
        suggestion?.outcomes.flatMap((outcome) =>
          outcome?.reason === "deload" && outcome.loadFactor !== undefined
            ? [outcome.loadFactor]
            : [],
        ) ?? [],
    );
    return phaseText.banner(
      session.phase,
      modifiers,
      testTop,
      hasEffort,
      loadCutRange(factors) ?? session.phaseModifiers?.load_cuts,
    );
  })();

  // ---- Sheets and dialogs ----
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sessionMenu, setSessionMenu] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SessionExerciseDetail | null>(null);
  const [musclesOpen, setMusclesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const openClock = useCallback(() => {
    closeKeypad();
    setClockOpen(true);
  }, [closeKeypad]);
  const closeSheet = useCallback(() => setSheet(null), []);

  const { ticked, unticked } = stats;

  const flow = useFinishFlow({
    session,
    title,
    ticked,
    unticked,
    actions,
    flush: flushWrites,
    closeKeypad: logging.closeKeypad,
    onMinimise,
    onFinished,
  });

  const addExercises = async () => {
    const picked = await pickExercises({ exclude: exerciseIds, sessionId: session.id });
    if (picked && picked.length > 0) await actions.addExercises(session.id, picked);
  };
  const replace = async (entry: SessionExerciseDetail) => {
    const picked = await pickExercises({
      max: 1,
      exclude: exerciseIds,
      swapFor: entry.exerciseId,
      sessionId: session.id,
    });
    const next = picked?.[0];
    if (!next) return;
    // A Session from a Workout asks how far the swap goes; one without has only itself.
    if (entry.sourceWorkoutExerciseId) setSheet({ kind: "swap", exercise: entry, next });
    else await actions.replaceExercise(entry, next, "session");
  };

  const { reveal: revealRow, hasRow } = reveal;
  const activeSetId = logging.activeSetId;
  const activeExercise = activeSetId ? logging.found.get(activeSetId)?.exercise.id : undefined;
  // Back closes the keypad before it minimises the workout.
  useFocusEffect(
    useCallback(() => {
      if (!activeSetId) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        closeKeypad();
        return true;
      });
      return () => subscription.remove();
    }, [activeSetId, closeKeypad]),
  );
  useEffect(() => {
    if (!activeSetId) return;
    let cancelReveal: (() => void) | undefined;
    let cancelled = false;
    const cancelFirst = afterLayout(() => {
      if (hasRow(activeSetId)) {
        revealRow(activeSetId);
        return;
      }
      if (!activeExercise) return;
      void scrollRef.current?.scrollToKey({ key: activeExercise, animated: false }).then(() => {
        if (!cancelled) cancelReveal = afterLayout(() => revealRow(activeSetId));
      });
    });
    return () => {
      cancelled = true;
      cancelFirst();
      cancelReveal?.();
    };
  }, [activeSetId, activeExercise, hasRow, revealRow]);

  // ---- The exercise menu ----
  const menuExercise = sheet?.kind === "menu" ? sheet.exercise : null;
  const menuPlace = menuExercise ? (logging.places.get(menuExercise.id) ?? "none") : "none";
  const menuIndex = menuExercise
    ? session.exercises.findIndex((entry) => entry.id === menuExercise.id)
    : -1;
  const canJoin =
    menuIndex >= 0 &&
    menuIndex < session.exercises.length - 1 &&
    (menuPlace === "none" || menuPlace === "last");
  const menuActions: SwipeAction[] = menuExercise
    ? [
        {
          key: "view",
          label: t("session__view_exercise"),
          icon: Info,
          onPress: () => viewExercise(menuExercise.exerciseId),
        },
        {
          key: "replace",
          label: t("training__replace"),
          icon: Swap,
          onPress: () => void replace(menuExercise),
        },
        ...(canJoin
          ? [
              {
                key: "superset",
                label: t("training__superset_with_next"),
                icon: Link,
                onPress: () => void actions.superset(menuExercise.id),
              },
            ]
          : []),
        ...(menuPlace === "none"
          ? []
          : [
              {
                key: "leave-superset",
                label: t("training__superset_remove"),
                icon: LinkBreak,
                onPress: () => void actions.leaveSuperset(menuExercise.id),
              },
            ]),
        {
          key: "note",
          label: t("session__pinned_note"),
          icon: NotePencil,
          onPress: () => setSheet({ kind: "note", exercise: menuExercise }),
        },
        {
          key: "pinned",
          label: t(
            menuExercise.pinnedNote === null
              ? "session__pin_note_action"
              : "session__edit_pinned_note_action",
          ),
          icon: PushPin,
          onPress: () => setSheet({ kind: "pinned", exercise: menuExercise }),
        },
        ...(menuExercise.type === "weight_reps" || menuExercise.type === "bodyweight_weighted_reps"
          ? [
              {
                key: "limits",
                label: t("gym__limits_action"),
                icon: Barbell,
                onPress: () => setSheet({ kind: "limits", exercise: menuExercise }),
              },
            ]
          : []),
        ...(SET_FIELDS[menuExercise.type].some((field) => field === "weight")
          ? [
              {
                key: "unit",
                label: t("session__exercise_unit", {
                  unit: unitLabels[menuExercise.unit ?? "default"],
                }),
                icon: Gauge,
                onPress: () => setSheet({ kind: "unit", exercise: menuExercise }),
              },
            ]
          : []),
        {
          key: "effort",
          label: t(menuExercise.logEffort ? "session__effort_off" : "session__effort_on"),
          icon: Gauge,
          onPress: () =>
            void actions.updateExercise(menuExercise.id, { log_effort: !menuExercise.logEffort }),
        },
        ...(!readOnly && canAddWarmups(menuExercise)
          ? [
              {
                key: "warmups",
                label: t("session__add_warmups"),
                icon: FireSimple,
                onPress: () =>
                  void addWarmups(menuExercise).then((result) => {
                    if (result === "none") toast.show({ label: t("session__warmups_none") });
                  }),
              },
            ]
          : []),
        {
          key: "remove",
          label: t("training__remove"),
          icon: Trash,
          tone: "danger",
          onPress: () => {
            const hasTicks = menuExercise.sets.some((set) => set.completedAt !== null);
            if (hasTicks) setConfirmRemove(menuExercise);
            else void actions.removeExercise(menuExercise.id);
          },
        },
      ]
    : [];

  const swap = sheet?.kind === "swap" ? sheet : null;
  const swapActions: SwipeAction[] = swap
    ? [
        {
          key: "session",
          label: t("session__swap_session"),
          icon: Swap,
          onPress: () => void actions.replaceExercise(swap.exercise, swap.next, "session"),
        },
        {
          key: "workout",
          label: t("session__swap_workout"),
          icon: Swap,
          onPress: () => void actions.replaceExercise(swap.exercise, swap.next, "workout"),
        },
      ]
    : [];

  const kindSet = sheet?.kind === "set-kind" ? logging.found.get(sheet.setId) : undefined;
  const effortSet = sheet?.kind === "effort" ? logging.found.get(sheet.setId) : undefined;
  const noteExercise = sheet?.kind === "note" ? sheet.exercise : null;
  const pinnedExercise = sheet?.kind === "pinned" ? sheet.exercise : null;
  const limitsExercise = sheet?.kind === "limits" ? sheet.exercise : null;
  const unitExercise =
    sheet?.kind === "unit"
      ? session.exercises.find((entry) => entry.id === sheet.exercise.id)
      : undefined;

  const accessory = useSessionKeypadAccessory(logging, sessionGymId);

  const onKind = useCallback((setId: string) => setSheet({ kind: "set-kind", setId }), []);
  const onEffort = useCallback((setId: string) => setSheet({ kind: "effort", setId }), []);
  const { found: foundSets } = logging;
  const onLimits = useCallback(
    (setId: string) => {
      const at = foundSets.get(setId);
      if (
        at &&
        (at.exercise.type === "weight_reps" || at.exercise.type === "bodyweight_weighted_reps")
      ) {
        closeKeypad();
        setSheet({ kind: "limits", exercise: at.exercise });
      }
    },
    [closeKeypad, foundSets],
  );
  const onMenu = useCallback((exercise: SessionExerciseDetail) => {
    setSheet({ kind: "menu", exercise });
  }, []);
  const { addSet, openCell, onTick, onPrevious, onTimer } = logging;
  const onAddSet = useCallback((exerciseId: string) => void addSet(exerciseId), [addSet]);
  const { updateExercise, setExerciseDeload } = actions;
  const onStallDeload = useStableHandler(
    (id: string, applied: boolean) => void setExerciseDeload(id, applied),
  );
  const onNote = useCallback(
    (exerciseId: string, note: string | null) => void updateExercise(exerciseId, { note }),
    [updateExercise],
  );
  const onRest = useCallback(
    (exerciseId: string, restSeconds: number | null) =>
      void updateExercise(exerciseId, { rest_seconds: restSeconds }),
    [updateExercise],
  );
  const onToggle = useCallback(
    (exerciseId: string) => {
      const state = store.getState();
      const editing = state.cell && state.found.get(state.cell.setId);
      const block = blockOf(state.blocks, exerciseId);
      if (
        editing &&
        state.expanded.has(exerciseId) &&
        block?.members.some((member) => member.id === editing.exercise.id)
      )
        closeKeypad();
      state.toggleExpanded(exerciseId);
    },
    [store, closeKeypad],
  );
  const onItemLayout = useCallback(
    (exerciseId: string) => {
      const state = store.getState();
      const setId = state.cell?.setId;
      if (setId && state.found.get(setId)?.exercise.id === exerciseId) revealRow(setId);
    },
    [store, revealRow],
  );
  const { onCopySets } = logging;
  const { registerRow } = reveal;
  // Rows are memoized and take these as one object: handlers that keep their identity keep the
  // rows from redrawing when something unrelated on this screen changes.
  const removeOneSet = useStableHandler(actions.removeOneSet);
  const stableView = useStableHandler(viewExercise);
  const stableToggle = useStableHandler(onToggle);
  const stableReorder = useStableHandler(openReorder);
  const stableAddSet = useStableHandler(onAddSet);
  const stableNote = useStableHandler(onNote);
  const stableRest = useStableHandler(onRest);
  const stableLayout = useStableHandler(onItemLayout);
  // Everything a row can do, as one object that keeps its identity while these handlers do.
  const handlers = useMemo<ExerciseHandlers>(
    () => ({
      onView: stableView,
      onToggle: stableToggle,
      onMenu,
      onAddSet: stableAddSet,
      onReorder: stableReorder,
      onNote: stableNote,
      onRest: stableRest,
      onStallDeload,
      onCell: openCell,
      onTick,
      onKind,
      onLimits,
      onEffort,
      onPrevious,
      onCopySets,
      onRemoveSet: removeOneSet,
      onTimer,
      registerRow,
      onLayout: stableLayout,
    }),
    [
      stableView,
      stableToggle,
      onMenu,
      stableAddSet,
      stableReorder,
      stableNote,
      stableRest,
      onStallDeload,
      openCell,
      onTick,
      onKind,
      onLimits,
      onEffort,
      onPrevious,
      onCopySets,
      removeOneSet,
      onTimer,
      registerRow,
      stableLayout,
    ],
  );
  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ExerciseItem
        exerciseId={item}
        handlers={handlers}
        animate={animate}
        viewport={viewport}
        isInViewport={isInViewport}
      />
    ),
    [animate, handlers, isInViewport, viewport],
  );
  const onScroll = reveal.onScroll;
  const onListScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) =>
      onScroll(event.nativeEvent.contentOffset.y),
    [onScroll],
  );
  const listContentStyle = useMemo(() => ({ paddingBottom: bottom + 32 }), [bottom]);
  return (
    <>
      <SheetShell
        isOpen={musclesOpen}
        onOpenChange={setMusclesOpen}
        title={t("exercise__muscle_distribution")}
      >
        {musclesOpen ? (
          <ScrollView>
            <MuscleDistribution
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
          </ScrollView>
        ) : null}
      </SheetShell>
      <SessionHeader
        animate={animate}
        finished={session.finishedAt !== null}
        onMenu={() => setSessionMenu(true)}
        sessionId={session.id}
        gymId={sessionGymId}
        title={title}
        startedAt={session.startedAt}
        pausedAt={session.pausedAt}
        pausedMs={session.pausedMs}
        volume={volume}
        sets={stats.sets}
        readOnly={readOnly}
        onMinimise={onMinimise}
        onFinish={flow.askFinish}
        onOpenClock={openClock}
        banner={phaseBanner}
      />
      <ClockSheet
        isOpen={clockOpen && !readOnly && session.finishedAt === null}
        onOpenChange={setClockOpen}
        startedAt={session.startedAt}
        pausedAt={session.pausedAt}
        pausedMs={session.pausedMs}
        firstTickedAt={clockOpen ? firstTickedAt(session) : null}
        onTogglePause={() => actions.togglePause(session.id)}
        onSetStart={(startedAt) => actions.setStart(session.id, startedAt)}
      />
      <View
        ref={attachViewport}
        collapsable={false}
        className="flex-1"
        onLayout={() => {
          if (activeSetId) revealRow(activeSetId);
        }}
      >
        <LegendList
          ref={scrollRef}
          className="flex-1"
          data={exerciseKeys}
          keyExtractor={exerciseKey}
          renderItem={renderItem}
          estimatedItemSize={ESTIMATED_CLOSED_HEIGHT}
          onItemSizeChanged={accordionScroll.onItemSizeChanged}
          onMetricsChange={onListMetrics}
          onScrollBeginDrag={() => {
            accordionScroll.cancel();
            dismissSwipeRows();
          }}
          // Rows keep their own state (the note being typed, a swipe), so cells are not reused.
          recycleItems={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onListScroll}
          contentContainerStyle={listContentStyle}
          ListHeaderComponent={
            <View className="gap-3 pb-3">
              {mine || installId === null || session.finishedAt !== null ? null : (
                <OwnershipBanner
                  lost={hadIt.current}
                  onTakeOver={() => void actions.takeOver(session.id)}
                />
              )}
              {historyFailed ? (
                <View className="gap-2 p-4">
                  <Text accessibilityRole="alert" className="font-normal text-body text-muted">
                    {t("session__previous_failed")}
                  </Text>
                  <Button variant="secondary" onPress={retryHistory}>
                    <Button.Label>{t("training__retry")}</Button.Label>
                  </Button>
                </View>
              ) : null}
              {session.workoutNote === null ? null : (
                <View className="mx-4 mt-3 gap-0.5 py-1">
                  <Text className="text-overline font-semibold uppercase text-muted">
                    {t("session__workout_note")}
                  </Text>
                  <Text className="font-normal text-body text-foreground">
                    {session.workoutNote}
                  </Text>
                </View>
              )}
            </View>
          }
          ListFooterComponent={
            readOnly ? null : (
              <View className="mt-4 px-4">
                <Button
                  variant={session.exercises.length === 0 ? "primary" : "secondary"}
                  isDisabled={session.exercises.length >= SESSION_LIMITS.exercisesPerSession}
                  onPress={() => void addExercises()}
                >
                  <Plus size={20} color={foreground} />
                  <Button.Label>{t("training__add_exercises")}</Button.Label>
                </Button>
              </View>
            )
          }
        />
      </View>
      {session.rest && !readOnly ? (
        <RestBar
          animate={animate}
          rest={session.rest}
          withInset={!logging.entry}
          pausedAt={session.pausedAt}
          onAdjust={(delta) => void actions.nudgeRest(session.id, delta)}
          onSkip={() => void actions.skipRest(session.id)}
        />
      ) : null}
      <SessionKeypad logging={logging} accessory={accessory} motion={false} />
      <ReorderView
        motion={false}
        visible={reordering && !readOnly}
        onClose={() => setReordering(false)}
        items={session.exercises}
        onMove={actions.moveExercise}
        labelOf={(entry) => entry.title || t("training__exercise_missing")}
        renderRow={(entry, _index, place) => (
          <CompactRow
            place={place}
            title={entry.title || t("training__exercise_missing")}
            leading={
              <ExerciseThumbnail
                title={entry.title}
                imageMediaId={entry.exercise?.imageMediaId}
                thumbnailKey={entry.exercise?.thumbnailKey ?? null}
                size={36}
              />
            }
          />
        )}
      />

      <ActionSheet
        isOpen={sessionMenu}
        onOpenChange={setSessionMenu}
        title={title}
        actions={[
          {
            key: "settings",
            label: t("session__settings_title"),
            icon: GearSix,
            onPress: () => setSettingsOpen(true),
          },
          {
            key: "muscles",
            label: t("session__muscles"),
            icon: Person,
            onPress: () => setMusclesOpen(true),
          },
          ...(!readOnly && session.finishedAt === null
            ? [
                {
                  key: "discard",
                  label: t("session__discard_workout"),
                  icon: Trash,
                  tone: "danger",
                  onPress: flow.askDiscard,
                } satisfies SwipeAction,
              ]
            : []),
        ]}
      />
      <SessionSettingsSheet isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
      <RestPermissionSheet
        isOpen={askOpen}
        onOpenChange={setAskOpen}
        onAllow={() => {
          setAskOpen(false);
          void askNotificationPermission();
        }}
        onDecline={() => {
          markNotificationPermissionAsked();
          setAskOpen(false);
        }}
      />
      <ActionSheet
        title={menuExercise?.title ?? ""}
        actions={menuActions}
        isOpen={menuExercise !== null}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "menu") closeSheet();
        }}
      />
      <ActionSheet
        title={t("session__swap_scope_title", { title: swap?.exercise.title ?? "" })}
        actions={swapActions}
        isOpen={swap !== null}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "swap") closeSheet();
        }}
      />
      <NoteSheet
        isOpen={noteExercise !== null}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "note") closeSheet();
        }}
        title={noteExercise?.title ?? ""}
        value={noteExercise?.note ?? null}
        onSave={(note) => {
          if (noteExercise) void actions.updateExercise(noteExercise.id, { note });
        }}
      />
      <NoteSheet
        isOpen={pinnedExercise !== null}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "pinned") closeSheet();
        }}
        title={pinnedExercise?.title ?? ""}
        value={pinnedExercise?.pinnedNote ?? null}
        label={t("session__pinned_exercise_note")}
        hint={t("session__pinned_exercise_note_hint")}
        placeholder={t("session__pinned_exercise_note_placeholder")}
        onSave={(note) => {
          if (pinnedExercise) void actions.setPinnedNote(pinnedExercise.exerciseId, note);
        }}
      />
      <ExerciseUnitSheet
        isOpen={unitExercise !== undefined}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "unit") closeSheet();
        }}
        preferred={unit}
        unit={unitExercise?.unit ?? null}
        onSelect={(next) => {
          if (!readOnly && unitExercise && next !== (unitExercise.unit ?? null)) {
            logging.closeKeypad();
            void setUnit(unitExercise.exerciseId, next).catch(() => undefined);
          }
        }}
      />
      <LoadLimitsSheet
        isOpen={limitsExercise !== null}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "limits") closeSheet();
        }}
        exerciseId={limitsExercise?.exerciseId ?? ""}
        title={limitsExercise?.title ?? ""}
        equipment={limitsExercise?.exercise?.equipment ?? "other"}
        unit={resolveExerciseUnit(unit, limitsExercise?.unit)}
        gymId={sessionGymId}
      />
      <SetTypeSheet
        isOpen={kindSet !== undefined}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "set-kind") closeSheet();
        }}
        value={kindSet?.set.kind ?? "working"}
        warmupsAllowed={kindSet ? supportsWarmups(kindSet.exercise.type) : false}
        onSelect={(kind: SetKind) => {
          if (kindSet) logging.onKindSelected(kindSet.set.id, kind);
        }}
      />
      <SessionEffortSheet
        isOpen={effortSet !== undefined}
        onOpenChange={(open) => {
          if (!open && sheet?.kind === "effort") closeSheet();
        }}
        value={effortSet?.set.rpe ?? null}
        scale={effortScale}
        onSelect={(rpe) => {
          if (effortSet) void actions.updateValues(effortSet.set.id, { rpe });
        }}
      />
      {flow.sheets}
      <ConfirmSheet
        isOpen={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
        title={t("session__remove_title", { title: confirmRemove?.title ?? "" })}
        description={t("session__remove_body")}
        cancelLabel={t("session__keep_logging")}
        destructive
        confirmLabel={t("training__remove")}
        onConfirm={() => {
          if (confirmRemove) void actions.removeExercise(confirmRemove.id);
        }}
      />
    </>
  );
});
