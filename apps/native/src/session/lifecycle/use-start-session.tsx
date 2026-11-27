import {
  ACTIVE_SESSIONS_SQL,
  FINISHED_OF_WORKOUT_SQL,
  beginSession,
  newSessionId,
  parseActiveSessions,
  parseFinishedOfWorkout,
  restoreSession,
  type ActiveSession,
  type BeginSource,
} from "@workspace/sync";
import { finishedToday, type RunSlot } from "@workspace/shared";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { useTrainingWrite } from "@/training";

import { StartConflictSheet } from "./start-conflict-sheet";
import { openSessionOf } from "./open-session-of";

/** What a new Session is made from: a Workout (or nothing), or a finished Session to repeat. */
type Pending = { source: BeginSource; active: ActiveSession[] };

/** A Workout that already has a finished Session today, waiting for "Start again". */
type Repeat = { source: BeginSource; title: string };

/**
 * Starting a Session, from a Workout, empty, or as an exact copy of a finished one (Perform again). When one is already active the user is asked
 * whether to resume it or to discard it and start the new one (ADR 0038); nothing is discarded
 * without asking. A Workout already finished today asks once before it starts again. Render
 * `sheet` next to the screen that starts. A start is idempotent: it has one id, so a double tap
 * or a retry opens the same Session.
 */
export function useStartSession({ resumeSameWorkout = false } = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { write, writeScope, undoToast } = useTrainingWrite();
  const timeZone = useDeviceTimeZone();
  const [pending, setPending] = useState<Pending | null>(null);
  // Mounted closed and opened by a change, as dialogs are; `repeat` stays for the closing animation.
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const starting = useRef(false);
  const checking = useRef(false);

  const open = useCallback(
    (id: string) => router.push({ pathname: "/session/[id]", params: { id } }),
    [router],
  );

  const begin = useCallback(
    async (source: BeginSource, discard: readonly ActiveSession[]) => {
      if (starting.current) return;
      starting.current = true;
      try {
        const id = newSessionId();
        // The source is read, the active Session discarded and the new one created in one
        // transaction, so a source that is gone leaves the active Session alone.
        const result = await write(
          (db) =>
            beginSession(
              db,
              // The Run's calendar week, and so the phase, is counted in the user's time zone.
              "againOf" in source ? source : { ...source, timeZone },

              t("session__untitled"),
              { id, discardIds: discard.map((old) => old.id) },
              writeScope,
            ),
          null,
        );
        if (!result) return;
        haptic.confirm();
        if (result.removed.length > 0) {
          undoToast(t("session__discarded_toast", { title: discard[0]?.title ?? "" }), () => {
            for (const deleted of result.removed) {
              void write((db) => restoreSession(db, deleted, writeScope), false);
            }
          });
        }
        open(result.id);
      } finally {
        starting.current = false;
      }
    },
    [write, writeScope, t, undoToast, open, timeZone],
  );

  /**
   * The one way into a Session from the Train strip, Home, the Workout page and the editor. A
   * Workout with a Session already finished today (local day) asks once; resuming, an empty
   * Session and Perform again are the lifter's own choice and are not asked.
   */
  const startFrom = useCallback(
    async (source: BeginSource, confirmedRepeat = false) => {
      if (checking.current || starting.current) return;
      checking.current = true;
      try {
        const active = await write(
          async (db) => parseActiveSessions(await db.getAll(ACTIVE_SESSIONS_SQL)),
          null,
        );
        if (!active) return;
        const workoutId = "workoutId" in source ? source.workoutId : null;
        const matching = resumeSameWorkout ? openSessionOf(active, workoutId) : undefined;
        if (matching) {
          open(matching.id);
          return;
        }
        if (active.length > 0) {
          setPending({ source, active });
          return;
        }
        if (workoutId && !confirmedRepeat) {
          const now = new Date();
          const done = await write(
            async (db) =>
              parseFinishedOfWorkout(
                await db.getAll(FINISHED_OF_WORKOUT_SQL, [workoutId, now.toISOString()]),
              ),
            [],
          );
          const today = finishedToday(done, workoutId, now, timeZone);
          if (today) {
            setRepeat({ source, title: today.title });
            setRepeatOpen(true);
            return;
          }
        }
        await begin(source, []);
      } finally {
        checking.current = false;
      }
    },
    [write, resumeSameWorkout, open, timeZone, begin],
  );
  const start = useCallback((workoutId: string | null) => startFrom({ workoutId }), [startFrom]);
  const startSlot = useCallback(
    (workoutId: string, day: RunSlot) => startFrom({ workoutId, day }),
    [startFrom],
  );
  /** Starts a Session that repeats the finished Session `sessionId`, or asks first when one is active. */
  const startAgain = useCallback(
    (sessionId: string) => startFrom({ againOf: sessionId }),
    [startFrom],
  );

  const sheet = (
    <>
      <ConfirmationDialog
        isOpen={repeatOpen}
        onOpenChange={setRepeatOpen}
        title={t("guard__again_title")}
        description={t("guard__again_body", { title: repeat?.title ?? "" })}
        cancelLabel={t("common__cancel")}
        confirmLabel={t("guard__again_confirm")}
        onConfirm={() => {
          if (repeat) void startFrom(repeat.source, true);
        }}
      />
      <StartConflictSheet
        active={pending?.active ?? []}
        isOpen={pending !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPending(null);
        }}
        onResume={(id) => {
          setPending(null);
          open(id);
        }}
        onDiscardAndStart={() => {
          const current = pending;
          setPending(null);
          if (current) void begin(current.source, current.active);
        }}
      />
    </>
  );

  return { start, startSlot, startAgain, sheet };
}
