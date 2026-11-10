import {
  ACTIVE_SESSIONS_SQL,
  discardSession,
  newSessionId,
  parseActiveSessions,
  restoreSession,
  startSession,
  type ActiveSession,
  type DeletedSession,
} from "@workspace/sync";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useTrainingWrite } from "@/training";

import { StartConflictSheet } from "./components/start-conflict-sheet";

const NO_ACTIVE: ActiveSession[] = [];

type Pending = { workoutId: string | null; active: ActiveSession[] };

/**
 * Starting a Session, from a Workout or empty. When one is already active the user is asked
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
    async (workoutId: string | null, discard: readonly ActiveSession[]) => {
      if (starting.current) return;
      starting.current = true;
      try {
        const id = newSessionId();
        const result = await write(async (db) => {
          const removed: DeletedSession[] = [];
          for (const old of discard) {
            const deleted = await discardSession(db, old.id, writeScope);
            if (deleted) removed.push(deleted);
          }
          await startSession(
            db,
            { workoutId, derivedTitle: t("session__untitled") },
            { id },
            writeScope,
          );
          return { id, removed };
        }, null);
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
  const start = useCallback(
    async (workoutId: string | null) => {
      const active = await write(
        async (db) => parseActiveSessions(await db.getAll(ACTIVE_SESSIONS_SQL)),
        NO_ACTIVE,
      );
      if (active.length > 0) setPending({ workoutId, active });
      else await begin(workoutId, []);
    },
    [write, begin],
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
        if (current) void begin(current.workoutId, current.active);
      }}
    />
  );

  return { start, sheet };
}
