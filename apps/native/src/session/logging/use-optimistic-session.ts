import { markRestEnded } from "@/session/rest/rest-ended";
import { AppState } from "react-native";

import { pauseClock, resumeClock, type Ghosts } from "@workspace/shared";
import type { SetPatch } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { blockOf, highlightOf } from "./blocks";
import { previewValuePatch, savedSession, type PendingWrite, type SetChange } from "./optimistic";
import { RestNudges } from "@/session/rest/rest-nudges";
import type { useSessionActions } from "@/session/screen/use-session-actions";
import type { SessionStore } from "@/session/store/session-store";

type Actions = ReturnType<typeof useSessionActions>;

/** Bound the lifetime of saved overlays if the watch skips their final value. */
const PENDING_MS = 5000;

/**
 * Shows ticks, unticks and Rest changes the moment they are made. The local database's watch takes
 * most of a second to deliver a write back, which made a tick feel ignored. The pending changes
 * live in the Session's store, which shows them on top of the stored Session; this returns the
 * actions to use in place of `actions`. A write that fails takes its change back.
 */
export function useOptimisticSession(store: SessionStore, actions: Actions) {
  const writeTail = useRef(Promise.resolve());
  const enqueueWrite = useCallback(<T>(write: () => Promise<T>): Promise<T> => {
    const result = writeTail.current.then(write);
    writeTail.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [nudges] = useState(
    () =>
      new RestNudges(
        (delta) => actionsRef.current.nudgeRest(store.getState().stored.id, delta),
        (rest) => store.getState().setRestTarget(rest),
      ),
  );
  const awaitWrites = useCallback(async () => {
    await writeTail.current;
    await nudges.flush();
  }, [nudges]);
  useEffect(() => {
    nudges.observe(store.getState().stored.rest);
    return store.subscribe((state, before) => {
      if (state.stored.rest !== before.stored.rest || state.restTarget !== before.restTarget)
        nudges.observe(state.stored.rest);
    });
  }, [nudges, store]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void nudges.flush();
    });
    return () => {
      subscription.remove();
      void nudges.flush();
    };
  }, [nudges]);

  const addPreview = useCallback(
    (setId: string | null, change?: SetChange, rest?: PendingWrite["rest"]) => {
      const state = store.getState();
      const before = setId === null ? undefined : state.setsById.get(setId);
      const id = Symbol();
      const set =
        setId !== null && before && change ? { id: setId, before, value: change } : undefined;
      state.updatePending((pending) => [...pending, { id, set, rest }]);
      return { id, set };
    },
    [store],
  );

  const settle = useCallback(
    (id: symbol, change?: Omit<PendingWrite, "id" | "saved">) => {
      const drop = () =>
        store
          .getState()
          .updatePending((pending) =>
            pending.some((write) => write.id === id)
              ? pending.filter((write) => write.id !== id)
              : pending,
          );
      if (!change?.set && !change?.rest && !change?.clock) {
        drop();
        return;
      }
      store
        .getState()
        .updatePending((pending) =>
          pending.map((write) => (write.id === id ? { ...change, id, saved: true } : write)),
        );
      if (store.getState().pending.some((write) => write.id === id)) setTimeout(drop, PENDING_MS);
    },
    [store],
  );

  const updateValues = useCallback(
    (setId: string, patch: SetPatch) => {
      const value = previewValuePatch(patch);
      const { id, set } = addPreview(setId, value);
      return enqueueWrite(async () => {
        const wrote = await actions.updateValues(setId, patch);
        settle(id, wrote ? { set } : undefined);
        // A patch that was already saved is safe to tick; a failed patch is not.
        return wrote !== null;
      });
    },
    [actions.updateValues, addPreview, enqueueWrite, settle],
  );

  const tick = useCallback(
    (
      setId: string,
      ghosts: Ghosts,
      restSeconds: number | null,
      change: SetChange | undefined,
      expiresAt?: number,
      savingEdits?: Promise<boolean[]>,
    ) => {
      const state = store.getState();
      const at = state.found.get(setId);
      const block = at && blockOf(state.blocks, at.exercise.id);
      const finishesBlock =
        at && block && state.expanded.has(at.exercise.id) && !highlightOf(block, setId);
      const { id, set } = addPreview(setId, change);
      return enqueueWrite(async () => {
        if (savingEdits && (await savingEdits).includes(false)) {
          settle(id);
          return null;
        }
        await nudges.release();
        const before = savedSession(store.getState()).rest;
        const result = await actions.tick(setId, ghosts, restSeconds, expiresAt);
        if (!result?.ok || !result.wrote) {
          settle(id);
          return result;
        }
        settle(id, {
          set: set && {
            ...set,
            value: {
              ...previewValuePatch(result.values),
              completedAt: result.completedAt,
              timerStartedAt: null,
            },
          },
          rest: result.rest && { before, value: { value: { setId, ...result.rest } } },
        });
        const current = store.getState();
        if (
          finishesBlock &&
          current.found.get(setId)?.exercise.exerciseId === at.exercise.exerciseId
        )
          current.advanceAfterTick(setId, result.completedAt);
        return result;
      });
    },
    [actions.tick, addPreview, enqueueWrite, nudges, settle, store],
  );

  const untick = useCallback(
    (setId: string) => {
      const rest = { before: store.getState().session.rest, value: { clearFor: setId } };
      const { id, set } = addPreview(setId, { completedAt: null }, rest);
      return enqueueWrite(async () => {
        await nudges.release();
        const writtenRest = savedSession(store.getState()).rest;
        const wrote = await actions.untick(setId);
        if (wrote) store.getState().clearRecord(setId);
        settle(
          id,
          wrote
            ? {
                set,
                rest: writtenRest?.setId === setId ? { ...rest, before: writtenRest } : undefined,
              }
            : undefined,
        );
        return wrote;
      });
    },
    [actions.untick, addPreview, enqueueWrite, nudges, settle, store],
  );

  const skipRest = useCallback(
    (sessionId: string) => {
      const rest = { before: store.getState().session.rest, value: { value: null } };
      const { id } = addPreview(null, undefined, rest);
      return enqueueWrite(async () => {
        await nudges.release();
        const before = savedSession(store.getState()).rest;
        const skipped = await actions.skipRest(sessionId);
        settle(id, skipped ? { rest: { ...rest, before } } : undefined);
        if (skipped) markRestEnded(sessionId);
        return skipped;
      });
    },
    [actions.skipRest, addPreview, enqueueWrite, nudges, settle, store],
  );

  const togglePause = useCallback(
    async (sessionId: string) => {
      const state = store.getState();
      if (state.pending.some((write) => write.clock) || state.session.finishedAt !== null) return;
      const { startedAt, pausedAt, pausedMs } = state.session;
      const before = { startedAt, pausedAt, pausedMs };
      const now = Date.now();
      const clock = pausedAt === null ? pauseClock(before, now) : resumeClock(before, now).clock;
      const id = Symbol();
      state.updatePending((pending) => [...pending, { id, clock }]);
      await enqueueWrite(async () => {
        await nudges.release();
        const wrote = await (pausedAt === null
          ? actions.pause(sessionId)
          : actions.resume(sessionId));
        settle(id, wrote ? { clock } : undefined);
      });
    },
    [actions.pause, actions.resume, enqueueWrite, nudges, settle, store],
  );

  const nudgeRest = useCallback(
    (_sessionId: string, deltaSeconds: number) => {
      const { rest, pausedAt } = store.getState().session;
      nudges.add(rest, deltaSeconds, pausedAt === null ? Date.now() : Date.parse(pausedAt));
    },
    [nudges, store],
  );

  return useMemo(
    () => ({
      ...actions,
      tick,
      untick,
      skipRest,
      nudgeRest,
      updateValues,
      awaitWrites,
      togglePause,
    }),
    [actions, tick, untick, skipRest, nudgeRest, updateValues, awaitWrites, togglePause],
  );
}
