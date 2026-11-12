import { MuscleDistribution } from "@/platform/ui/muscle-distribution";
import { SessionSettingsSheet } from "./session-settings-sheet";
import { SheetShell } from "./sheet-shell";
import {
  MUSCLE_GROUP_KEYS,
  SESSION_LIMITS,
  derivedWorkoutTitle,
  sessionTotals,
  type SetKind,
} from "@workspace/shared";
import type { SessionDetail, SessionExerciseDetail } from "@workspace/sync";
import { useFocusEffect, useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useThemeColor } from "heroui-native";
import {
  Gauge,
  GearSix,
  Info,
  Person,
  Link,
  LinkBreak,
  NotePencil,
  Plus,
  Swap,
  Trash,
  WarningCircle,
} from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Animated from "react-native-reanimated";
import { BackHandler, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePickExercises } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";
import { EmptyState } from "@/platform/ui/empty-state";
import { Skeleton } from "@/platform/ui/skeleton";
import type { SwipeAction } from "@/platform/ui/swipe-row";
import {
  HideWhileDragging,
  ReorderList,
  useReorderScroll,
  SetTypeSheet,
  supportsWarmups,
} from "@/training";

import { setRestSurfaceVisible } from "../rest-notification";
import { askRestPermission, markRestPermissionAsked } from "../rest-permission-store";
import { allTicked, doneSummary, formatVolume, progressText } from "../summary";
import { restBelongsTo } from "../rest-rules";
import { useRestRunning } from "../use-rest-running";
import { afterLayout, useRowReveal } from "../use-row-reveal";
import { useWarmCount } from "../use-warm-count";
import { useFinishFlow } from "../use-finish-flow";
import { useSessionLogging } from "../use-session-logging";
import { useSession } from "../use-session";
import { loggedSetsOf } from "../set-values";
import { ExerciseItem } from "./exercise-item";
import { NoteSheet } from "./note-sheet";
import { SessionEffortSheet } from "./effort-sheet";
import { OwnershipBanner } from "./ownership-banner";
import { RestBar } from "./rest-bar";
import { RestPermissionSheet } from "./rest-permission-sheet";
import { SessionHeader } from "./session-header";
import { SessionKeypad, useSessionKeypadAccessory } from "./session-keypad";
import type { ActiveEntry } from "./set-row";

const KEEP_AWAKE_TAG = "session";

/** The keypad's cell when it sits in this exercise; null for every other exercise. */
function ownEntry(exercise: SessionExerciseDetail, entry: ActiveEntry | null): ActiveEntry | null {
  return entry && exercise.sets.some((set) => set.id === entry.cell.setId) ? entry : null;
}

/** Where the screen sends the user. */
export type SessionScreenProps = {
  id: string;
  /** Minimise: back to the tabs, the Session stays active. */
  onMinimise: () => void;
  /** The Session is gone (discarded elsewhere): leave. */
  onGone: () => void;
  /** Finished here: show the summary. */
  onFinished: (id: string) => void;
  /** Open the full-screen Timer over this screen. */
  onOpenTimer: () => void;
};

/**
 * The logging screen of one Session: an accordion of exercises with one block open, the set
 * grid, the custom keypad, and the header with the clock and totals. A Session another device
 * owns is read-only here until taken over. Everything comes through the module hooks.
 */
export function SessionScreen(props: SessionScreenProps) {
  const { t } = useTranslation();
  const state = useSession(props.id);
  useEffect(() => {
    if (state.status === "missing") props.onGone();
  }, [state.status, props]);

  if (state.status === "loading" || state.status === "missing") return <SessionSkeleton />;
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
  return <LoadedSession key={state.session.id} session={state.session} {...props} />;
}

function SessionSkeleton() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 gap-3 bg-background p-4 pt-16">
      <Skeleton label={t("common__loading")} className="h-12 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </View>
  );
}

type Sheet =
  | { kind: "menu"; exercise: SessionExerciseDetail }
  | { kind: "note"; exercise: SessionExerciseDetail }
  | { kind: "set-kind"; setId: string }
  | { kind: "effort"; setId: string };

function LoadedSession({
  session: stored,
  onMinimise,
  onFinished,
  onOpenTimer,
}: SessionScreenProps & { session: SessionDetail }) {
  const { t, i18n } = useTranslation();
  const foreground = useThemeColor("foreground");
  const router = useRouter();
  const viewExercise = useCallback(
    (id: string) => router.push({ pathname: "/exercise-view/[id]", params: { id } }),
    [router],
  );
  const {
    session,
    actions,
    preferences,
    setUi,
    preferencesLoading,
    unit,
    effortScale,
    bodyweightKg,
    installId,
    mine,
    hadIt,
    readOnly,
    exerciseIds,
    historyReady,
    historyFailed,
    retryHistory,
    logging,
    askOpen,
    setAskOpen,
  } = useSessionLogging(stored);
  const pickExercises = usePickExercises("session");
  const reorderScroll = useReorderScroll();
  const reveal = useRowReveal(reorderScroll.ref);
  const { bottom } = useSafeAreaInsets();
  const restRunning = useRestRunning(session.rest);

  // The Timer is the other way to log: the clock opens it and the choice is remembered, so the
  // next workout (started or resumed) opens in the view used last.
  // Each screen has its own keypad: the draft here is saved and closed before the Timer edits.
  const { closeKeypad } = logging;
  const openTimer = useCallback(() => {
    closeKeypad();
    setUi({ sessionView: "timer" });
    onOpenTimer();
  }, [closeKeypad, setUi, onOpenTimer]);
  const openedTimer = useRef(false);
  const wantsTimer = preferences.ui.sessionView === "timer";
  useEffect(() => {
    if (openedTimer.current || preferencesLoading || installId === null) return;
    openedTimer.current = true;
    if (wantsTimer && !readOnly && session.finishedAt === null) onOpenTimer();
  }, [preferencesLoading, installId, wantsTimer, readOnly, session.finishedAt, onOpenTimer]);

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

  const totals = useMemo(
    () => sessionTotals(loggedSetsOf(session), bodyweightKg),
    [session, bodyweightKg],
  );
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const volume = `${formatVolume(totals.volume, unit, i18n.language)} ${unitName}`;

  // ---- Sheets and dialogs ----
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sessionMenu, setSessionMenu] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SessionExerciseDetail | null>(null);
  const [musclesOpen, setMusclesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSheet = useCallback(() => setSheet(null), []);

  const allSets = session.exercises.flatMap((entry) => entry.sets);
  const ticked = allSets.filter((set) => set.completedAt !== null).length;
  const unticked = allSets.length - ticked;

  const flow = useFinishFlow({
    session,
    title,
    ticked,
    unticked,
    actions,
    flush: logging.flush,
    closeKeypad: logging.closeKeypad,
    onMinimise,
    onFinished,
  });

  const addExercises = async () => {
    const picked = await pickExercises({ exclude: exerciseIds });
    if (picked && picked.length > 0) await actions.addExercises(session.id, picked);
  };
  const replace = async (entry: SessionExerciseDetail) => {
    const picked = await pickExercises({ max: 1, exclude: exerciseIds, swapFor: entry.exerciseId });
    const next = picked?.[0];
    if (next) await actions.replaceExercise(entry.id, entry.exerciseId, next);
  };

  // Scroll the open block to the top, and the edited row above the keypad.
  const { alignTop, reveal: revealRow } = reveal;
  const openFirst = logging.blocks.find((block) => block.id === logging.openBlockId)?.members[0]
    ?.id;
  useEffect(() => {
    if (!openFirst) return;
    // After the next layout pass, not a fixed delay.
    return afterLayout(() => alignTop(`ex:${openFirst}`));
  }, [openFirst, alignTop]);
  const activeSetId = logging.activeSetId;
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
    const timer = setTimeout(() => revealRow(activeSetId), 90);
    return () => clearTimeout(timer);
  }, [activeSetId, revealRow]);

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
          key: "effort",
          label: t(menuExercise.logEffort ? "session__effort_off" : "session__effort_on"),
          icon: Gauge,
          onPress: () =>
            void actions.updateExercise(menuExercise.id, { log_effort: !menuExercise.logEffort }),
        },
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

  const kindSet = sheet?.kind === "set-kind" ? logging.found.get(sheet.setId) : undefined;
  const effortSet = sheet?.kind === "effort" ? logging.found.get(sheet.setId) : undefined;
  const noteExercise = sheet?.kind === "note" ? sheet.exercise : null;

  const accessory = useSessionKeypadAccessory(logging, unit);

  const onKind = useCallback((setId: string) => setSheet({ kind: "set-kind", setId }), []);
  const onEffort = useCallback((setId: string) => setSheet({ kind: "effort", setId }), []);
  const onMenu = useCallback((exercise: SessionExerciseDetail) => {
    setSheet({ kind: "menu", exercise });
  }, []);
  const removeSet = useCallback((setId: string) => void actions.removeOneSet(setId), [actions]);
  const { toggleBlock, addSet, openCell, onTick, onPrevious, onTimer } = logging;
  const onAddSet = useCallback((exerciseId: string) => void addSet(exerciseId), [addSet]);
  const { updateExercise } = actions;
  const onNote = useCallback(
    (exerciseId: string, note: string | null) => void updateExercise(exerciseId, { note }),
    [updateExercise],
  );
  const onRest = useCallback(
    (exerciseId: string, restSeconds: number | null) =>
      void updateExercise(exerciseId, { rest_seconds: restSeconds }),
    [updateExercise],
  );
  const registerSetRow = reveal.registerRow;
  // The open block's exercises, and those whose closed body is already built.
  const openIds = useMemo(() => {
    const open = logging.blocks.find((block) => block.id === logging.openBlockId);
    return new Set(open?.members.map((member) => member.id));
  }, [logging.blocks, logging.openBlockId]);
  const warmCount = useWarmCount(session.exercises.length);
  const warmIds = useMemo(
    () => new Set(session.exercises.slice(0, warmCount).map((entry) => entry.id)),
    [session.exercises, warmCount],
  );

  // One ready state: the screen draws once it knows whose Session this is and the exercises'
  // Previous values, instead of drawing read-only and empty first and filling in.
  if (installId === null || !(historyReady || historyFailed)) return <SessionSkeleton />;

  return (
    <View className="flex-1 bg-background">
      <SheetShell
        isOpen={musclesOpen}
        onOpenChange={setMusclesOpen}
        title={t("exercise__muscle_distribution")}
      >
        <ScrollView>
          <MuscleDistribution
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
        </ScrollView>
      </SheetShell>
      <SessionHeader
        finished={session.finishedAt !== null}
        onMenu={() => setSessionMenu(true)}
        title={title}
        startedAt={session.startedAt}
        volume={volume}
        sets={totals.sets}
        readOnly={readOnly}
        onMinimise={onMinimise}
        onFinish={flow.askFinish}
        onOpenTimer={openTimer}
      />
      <View ref={reveal.viewportRef} collapsable={false} className="flex-1">
        <Animated.ScrollView
          ref={reorderScroll.ref}
          className="flex-1"
          animatedProps={reorderScroll.animatedProps}
          onContentSizeChange={reorderScroll.onContentSizeChange}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(event) => reveal.onScroll(event.nativeEvent.contentOffset.y)}
          contentContainerStyle={{ paddingBottom: bottom + 32 }}
        >
          {mine || installId === null || session.finishedAt !== null ? null : (
            <OwnershipBanner
              lost={hadIt.current}
              onTakeOver={() => void actions.takeOver(session.id)}
            />
          )}
          {historyFailed ? (
            <View className="gap-2 p-4">
              <Text accessibilityRole="alert" className="text-body text-muted">
                {t("session__previous_failed")}
              </Text>
              <Button variant="secondary" onPress={retryHistory}>
                <Button.Label>{t("training__retry")}</Button.Label>
              </Button>
            </View>
          ) : null}
          <View className="mt-3">
            <ReorderList
              items={session.exercises}
              scroll={reorderScroll}
              headerHeight={64}
              enabled={!readOnly}
              onDragStart={logging.closeKeypad}
              onMove={(id, beforeId) => void actions.moveExercise(id, beforeId)}
              renderItem={(entry, { collapsed }) => (
                <View ref={reveal.registerRow(`ex:${entry.id}`)} collapsable={false}>
                  <ExerciseItem
                    exercise={entry}
                    suggestion={logging.suggestions.get(entry.id) ?? null}
                    place={logging.places.get(entry.id) ?? "none"}
                    open={openIds.has(entry.id)}
                    warm={warmIds.has(entry.id)}
                    dragging={collapsed}
                    progress={progressText(entry.sets)}
                    summary={
                      allTicked(entry.sets)
                        ? doneSummary(entry.sets, entry.type, unit, unitName)
                        : ""
                    }
                    showAddSet={
                      logging.justCollapsedId === entry.id &&
                      restBelongsTo(session.rest, entry, restRunning)
                    }
                    readOnly={readOnly}
                    unit={unit}
                    effortScale={effortScale}
                    historyReady={logging.historyReadyFor(entry.exerciseId)}
                    editingFinished={logging.editingFinished}
                    entry={ownEntry(entry, logging.entry)}
                    refusal={
                      logging.refusal && entry.sets.some((set) => set.id === logging.refusal?.setId)
                        ? logging.refusal
                        : null
                    }
                    previousOf={logging.previousOf}
                    ghostsFor={logging.ghostsFor}
                    onView={viewExercise}
                    onToggle={toggleBlock}
                    onMenu={onMenu}
                    onAddSet={onAddSet}
                    onNote={onNote}
                    onRest={onRest}
                    onCell={openCell}
                    onTick={onTick}
                    onKind={onKind}
                    onEffort={onEffort}
                    onPrevious={onPrevious}
                    onCopySets={logging.onCopySets}
                    onRemoveSet={removeSet}
                    onTimer={onTimer}
                    registerRow={registerSetRow}
                  />
                </View>
              )}
            />
          </View>
          {readOnly ? null : (
            <HideWhileDragging dragging={reorderScroll.dragging}>
              <View className="mt-4 px-4">
                <Button
                  variant={session.exercises.length === 0 ? "primary" : "secondary"}
                  isDisabled={session.exercises.length >= SESSION_LIMITS.exercisesPerSession}
                  onPress={() => void addExercises()}
                >
                  <Plus size={16} color={foreground} weight="bold" />
                  <Button.Label>{t("training__add_exercises")}</Button.Label>
                </Button>
              </View>
            </HideWhileDragging>
          )}
        </Animated.ScrollView>
      </View>
      {session.rest && !readOnly ? (
        <RestBar
          rest={session.rest}
          withInset={!logging.entry}
          onAdjust={(delta) => void actions.nudgeRest(session.id, delta)}
          onSkip={() => void actions.skipRest(session.id)}
        />
      ) : null}
      <SessionKeypad logging={logging} accessory={accessory} />

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
          void askRestPermission();
        }}
        onDecline={() => {
          markRestPermissionAsked();
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
    </View>
  );
}
