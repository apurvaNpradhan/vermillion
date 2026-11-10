import {
  MUSCLE_GROUP_KEYS,
  SESSION_LIMITS,
  derivedWorkoutTitle,
  sessionTotals,
  type SetKind,
  type SupersetPlace,
} from "@workspace/shared";
import type { SessionDetail, SessionExerciseDetail } from "@workspace/sync";
import { useFocusEffect } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useThemeColor } from "heroui-native";
import {
  Gauge,
  Link,
  LinkBreak,
  NotePencil,
  Plus,
  Swap,
  Trash,
  WarningCircle,
} from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePickExercises } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { EmptyState } from "@/platform/ui/empty-state";
import { Keypad } from "@/platform/ui/keypad";
import { Skeleton } from "@/platform/ui/skeleton";
import type { SwipeAction } from "@/platform/ui/swipe-row";
import { usePreferences } from "@/preferences";
import { RestPicker, ReorderList, SetTypeSheet, supportsWarmups } from "@/training";

import { setRestSurfaceVisible } from "../rest-notification";
import {
  askRestPermission,
  markRestPermissionAsked,
  restPermissionAsked,
  useRestPermission,
} from "../rest-permission-store";
import { allTicked, doneSummary, formatVolume, progressText } from "../summary";
import { useSessionActions } from "../use-session-actions";
import { useInstallId } from "../use-install-id";
import { useKeypadAccessory } from "../keypad-accessory";
import { useLoggingState } from "../use-logging-state";
import { usePreviousSets } from "../use-previous-sets";
import { restBelongsTo } from "../rest-rules";
import { useRestRunning } from "../use-rest-running";
import { useRowReveal } from "../use-row-reveal";
import { useSession } from "../use-session";
import { loggedSetsOf } from "../set-values";
import { ExerciseRow } from "./exercise-row";
import { NoteSheet } from "./note-sheet";
import { SessionEffortSheet } from "./effort-sheet";
import { OwnershipBanner } from "./ownership-banner";
import { RestBar } from "./rest-bar";
import { RestPermissionSheet } from "./rest-permission-sheet";
import { SetGrid } from "./set-grid";
import { SessionHeader } from "./session-header";

const KEEP_AWAKE_TAG = "session";

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

  if (state.status === "loading" || state.status === "missing") {
    return (
      <View className="flex-1 gap-3 bg-background p-4 pt-16">
        <Skeleton label={t("common__loading")} className="h-12 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </View>
    );
  }
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
  return <LoadedSession session={state.session} {...props} />;
}

type Sheet =
  | { kind: "menu"; exercise: SessionExerciseDetail }
  | { kind: "note"; exercise: SessionExerciseDetail }
  | { kind: "set-kind"; setId: string }
  | { kind: "effort"; setId: string };

function LoadedSession({
  session,
  onMinimise,
  onFinished,
}: SessionScreenProps & { session: SessionDetail }) {
  const { t, i18n } = useTranslation();
  const foreground = useThemeColor("foreground");
  const actions = useSessionActions();
  const { preferences } = usePreferences();
  const unit = preferences.ui.weightUnit;
  const effortScale = preferences.ui.effortScale;
  const bodyweightKg = preferences.ui.bodyweightKg;
  const installId = useInstallId();
  const pickExercises = usePickExercises("session");
  const reveal = useRowReveal();

  // Ownership: another device's Session is read-only. A device that had it and lost it says so.
  const mine = installId !== null && session.deviceId === installId;
  const hadIt = useRef(false);
  useEffect(() => {
    if (mine) hadIt.current = true;
  }, [mine]);
  const readOnly = !mine || session.finishedAt !== null;

  const exerciseIds = useMemo(
    () => session.exercises.map((entry) => entry.exerciseId),
    [session.exercises],
  );
  const previous = usePreviousSets(exerciseIds);
  const { bottom } = useSafeAreaInsets();
  const restRunning = useRestRunning(session.rest);

  // Before the first Rest: our one-line explanation, then the system's dialog. Asked once.
  const permission = useRestPermission();
  const [askOpen, setAskOpen] = useState(false);
  const onRestStarted = useCallback(() => {
    if (permission === "undetermined" && !restPermissionAsked()) setAskOpen(true);
  }, [permission]);
  const logging = useLoggingState({
    session,
    previous,
    unit,
    effortScale,
    bodyweightKg,
    readOnly,
    actions,
    onRestStarted,
  });

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
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SessionExerciseDetail | null>(null);
  const [dragging, setDragging] = useState(false);
  const closeSheet = useCallback(() => setSheet(null), []);

  const allSets = session.exercises.flatMap((entry) => entry.sets);
  const ticked = allSets.filter((set) => set.completedAt !== null).length;
  const unticked = allSets.length - ticked;

  const finish = async () => {
    logging.flush();
    if (ticked === 0) {
      // Nothing was logged: a finished empty Session would only be clutter, so it is discarded.
      if (await actions.discard(session.id, title)) onMinimise();
      return;
    }
    const result = await actions.finish(session.id, {});
    if (result) onFinished(session.id);
  };

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
    const timer = setTimeout(() => alignTop(`ex:${openFirst}`), 120);
    return () => clearTimeout(timer);
  }, [openFirst, alignTop]);
  const activeSetId = logging.activeSetId;
  // Back closes the keypad before it minimises the workout.
  const { closeKeypad } = logging;
  useEffect(() => {
    if (!activeSetId) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeKeypad();
      return true;
    });
    return () => subscription.remove();
  }, [activeSetId, closeKeypad]);
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

  const keypadCell =
    logging.entry && logging.activeField
      ? (() => {
          const at = logging.found.get(logging.entry.cell.setId);
          return at
            ? { exercise: at.exercise, setId: at.set.id, field: logging.activeField, unit }
            : null;
        })()
      : null;
  const accessory = useKeypadAccessory(keypadCell);

  const onKind = useCallback((setId: string) => setSheet({ kind: "set-kind", setId }), []);
  const onEffort = useCallback((setId: string) => setSheet({ kind: "effort", setId }), []);
  const onMenu = useCallback((exercise: SessionExerciseDetail) => {
    setSheet({ kind: "menu", exercise });
  }, []);
  const removeSet = useCallback((setId: string) => void actions.removeOneSet(setId), [actions]);
  const { toggleBlock, addSet } = logging;
  const onAddSet = useCallback((exerciseId: string) => void addSet(exerciseId), [addSet]);

  return (
    <View className="flex-1 bg-background">
      <SessionHeader
        title={title}
        startedAt={session.startedAt}
        volume={volume}
        sets={totals.sets}
        readOnly={readOnly}
        onMinimise={onMinimise}
        onFinish={() => {
          logging.flush();
          if (ticked === 0 || unticked > 0) setConfirmFinish(true);
          else void finish();
        }}
      />
      <View ref={reveal.viewportRef} collapsable={false} className="flex-1">
        <ScrollView
          ref={reveal.scrollRef}
          className="flex-1"
          scrollEnabled={!dragging}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={(event) => reveal.onScroll(event.nativeEvent.contentOffset.y)}
          contentContainerStyle={{ paddingBottom: bottom + 32 }}
        >
          {mine || installId === null ? null : (
            <OwnershipBanner
              lost={hadIt.current}
              onTakeOver={() => void actions.takeOver(session.id)}
            />
          )}
          <View className="mt-3">
            <ReorderList
              items={session.exercises}
              onDraggingChange={(value) => {
                setDragging(value);
                if (value) logging.closeKeypad();
              }}
              onMove={(id, beforeId) => void actions.moveExercise(id, beforeId)}
              renderItem={(entry, { collapsed }) => (
                <View ref={reveal.registerRow(`ex:${entry.id}`)} collapsable={false}>
                  <ExerciseRow
                    exercise={entry}
                    place={logging.places.get(entry.id) ?? "none"}
                    open={
                      logging.blocks
                        .find((block) => block.id === logging.openBlockId)
                        ?.members.some((member) => member.id === entry.id) ?? false
                    }
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
                    onToggle={toggleBlock}
                    onMenu={onMenu}
                    onAddSet={onAddSet}
                  >
                    <ExerciseBody
                      entry={entry}
                      place={logging.places.get(entry.id) ?? "none"}
                      readOnly={readOnly}
                      onNote={() => setSheet({ kind: "note", exercise: entry })}
                      onRest={(restSeconds) =>
                        void actions.updateExercise(entry.id, { rest_seconds: restSeconds })
                      }
                    />
                    <SetGrid
                      exercise={entry}
                      logging={logging}
                      unit={unit}
                      effortScale={effortScale}
                      readOnly={readOnly}
                      onKind={onKind}
                      onEffort={onEffort}
                      onRemoveSet={removeSet}
                      registerRow={reveal.registerRow}
                    />
                  </ExerciseRow>
                </View>
              )}
            />
          </View>
          {readOnly ? null : (
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
          )}
        </ScrollView>
      </View>
      {session.rest && !readOnly ? (
        <RestBar
          rest={session.rest}
          withInset={!logging.entry}
          onAdjust={(delta) => void actions.nudgeRest(session.id, delta)}
          onSkip={() => void actions.skipRest(session.id)}
        />
      ) : null}
      {logging.entry && logging.activeField ? (
        <Keypad
          labels={{
            point: t("session__key_point"),
            backspace: t("session__key_backspace"),
            decrease: t("session__key_decrease", { step: logging.stepText }),
            increase: t("session__key_increase", { step: logging.stepText }),
            next: t("session__key_next"),
            done: t("session__key_done"),
          }}
          allowPoint={logging.activeField === "weight" || logging.activeField === "distance"}
          hasNext={logging.hasNext}
          stepText={logging.stepText}
          accessory={accessory}
          onKey={logging.onKey}
          onStep={logging.onStep}
          onNext={logging.onNext}
          onDone={logging.closeKeypad}
        />
      ) : null}

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
      <ConfirmationDialog
        isOpen={confirmFinish}
        onOpenChange={setConfirmFinish}
        title={t(ticked === 0 ? "session__discard_empty_title" : "session__finish_title")}
        description={
          ticked === 0
            ? t("session__discard_empty_body")
            : t("session__finish_unticked", { count: unticked })
        }
        cancelLabel={t("session__keep_logging")}
        confirmLabel={t(ticked === 0 ? "session__discard" : "session__finish")}
        onConfirm={() => void finish()}
      />
      <ConfirmationDialog
        isOpen={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
        title={t("session__remove_title", { title: confirmRemove?.title ?? "" })}
        description={t("session__remove_body")}
        cancelLabel={t("session__keep_logging")}
        confirmLabel={t("training__remove")}
        onConfirm={() => {
          if (confirmRemove) void actions.removeExercise(confirmRemove.id);
        }}
      />
    </View>
  );
}

/** The pinned note and rest chip at the top of an open exercise. */
function ExerciseBody({
  entry,
  place,
  readOnly,
  onNote,
  onRest,
}: {
  entry: SessionExerciseDetail;
  place: SupersetPlace;
  readOnly: boolean;
  onNote: () => void;
  onRest: (restSeconds: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      {entry.note ? (
        <Text
          accessibilityLabel={t("session__note_label", { note: entry.note })}
          className="px-1 text-body text-muted"
          onPress={readOnly ? undefined : onNote}
        >
          {entry.note}
        </Text>
      ) : null}
      {readOnly || place === "first" || place === "middle" ? null : (
        <RestPicker value={entry.restSeconds} group={place === "last"} onChange={onRest} />
      )}
    </View>
  );
}
