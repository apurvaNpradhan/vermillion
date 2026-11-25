import {
  ACTIVE_SESSIONS_SQL,
  beginSession,
  newSessionId,
  parseActiveSessions,
  restoreSession,
  type ActiveSession,
  type BeginSource,
} from "@workspace/sync";
import type { RunSlot } from "@workspace/shared";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useTrainingWrite } from "@/training";

import { StartConflictSheet } from "./start-conflict-sheet";

const NO_ACTIVE: ActiveSession[] = [];

/** What a new Session is made from: a Workout (or nothing), or a finished Session to repeat. */
type Pending = { source: BeginSource; active: ActiveSession[] };

/**
 * Starting a Session, from a Workout, empty, or as an exact copy of a finished one (Perform again). When one is already active the user is asked
 * whether to resume it or to discard it and start the new one (ADR 0038); nothing is discarded
 * without asking. Render `sheet` next to the screen that starts. A start is idempotent: it has
 * one id, so a double tap or a retry opens the same Session.
 */
export function useStartSession() {
  const { t } = useTranslation();
  const router = useRouter();
  const { write, writeScope, undoToast } = useTrainingWrite();
  const [pending, setPending] = useState<Pending | null>(null);
  const starting = useRef(false);

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
              source,
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
    [write, writeScope, t, undoToast, open],
  );

  /** Starts a Session from `workoutId` (or empty), or asks first when one is active. */
  const startFrom = useCallback(
    async (source: BeginSource) => {
      const active = await write(
        async (db) => parseActiveSessions(await db.getAll(ACTIVE_SESSIONS_SQL)),
        NO_ACTIVE,
      );
      if (active.length > 0) setPending({ source, active });
      else await begin(source, []);
    },
    [write, begin],
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
  );

  return { start, startSlot, startAgain, sheet };
}
