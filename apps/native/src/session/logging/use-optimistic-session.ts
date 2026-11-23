import { markRestEnded } from "@/session/rest/rest-ended";
import { AppState } from "react-native";

import type { Ghosts } from "@workspace/shared";
import type { SessionDetail, SetPatch } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  previewValuePatch,
  restFrom,
  restKey,
  setKey,
  settleTick,
  tickChange,
  type SetChange,
} from "./optimistic";
import { RestNudges } from "@/session/rest/rest-nudges";
import type { useSessionActions } from "@/session/screen/use-session-actions";
import type { SessionStore } from "@/session/store/session-store";

type Actions = ReturnType<typeof useSessionActions>;

/** A change the watch never confirms (a write that failed quietly) stops showing after this. */
const PENDING_MS = 5000;

/**
 * Shows ticks, unticks and Rest changes the moment they are made. The local database's watch takes
 * most of a second to deliver a write back, which made a tick feel ignored. The pending changes
 * live in the Session's store, which shows them on top of the stored Session; this returns the
 * actions to use in place of `actions`. A write that fails takes its change back.
 */
export function useOptimisticSession(store: SessionStore, actions: Actions) {
  const completionTail = useRef(Promise.resolve());
  const enqueueCompletion = useCallback(<T>(write: () => Promise<T>): Promise<T> => {
    const result = completionTail.current.then(write);
    completionTail.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);
  const awaitCompletions = useCallback(() => completionTail.current, []);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [nudges] = useState(
    () =>
      new RestNudges(
        (delta) => actionsRef.current.nudgeRest(store.getState().stored.id, delta),
        (rest) => store.getState().setRestTarget(rest),
      ),
  );
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

  const readSet = useCallback(
    (setId: string) => {
      const state = store.getState();
      const at = state.storedSets.get(setId);
      if (!at) return null;
      const change = state.pending.sets.get(setId)?.change;
      return change ? { ...at.set, ...change } : at.set;
    },
    [store],
  );

  const putSet = useCallback(
    (setId: string, change: SetChange, awaitFields = false) => {
      const state = store.getState();
      const at = state.storedSets.get(setId);
      if (!at) return () => undefined;
      const previous = state.pending.sets.get(setId);
      const entry = {
        before: setKey(at.set),
        change: { ...previous?.change, ...change },
        awaitFields: awaitFields || previous?.awaitFields,
      };
      state.updatePending((current) => ({
        ...current,
        sets: new Map(current.sets).set(setId, entry),
      }));
      const drop = () =>
        store.getState().updatePending((current) => {
          if (current.sets.get(setId) !== entry) return current;
          const sets = new Map(current.sets);
          sets.delete(setId);
          return { ...current, sets };
        });
      setTimeout(drop, PENDING_MS);
      return drop;
    },
    [store],
  );

  const editValues = useCallback(
    async (setId: string, patch: SetPatch) => {
      const undo = putSet(setId, previewValuePatch(patch), true);
      const wrote = await actions.updateValues(setId, patch);
      if (!wrote) undo();
      return wrote;
    },
    [actions.updateValues, putSet],
  );

  const putRest = useCallback(
    (value: SessionDetail["rest"]) => {
      const state = store.getState();
      const entry = { before: restKey(state.stored.rest), value };
      state.updatePending((current) => ({ ...current, rest: entry }));
      const drop = () =>
        store
          .getState()
          .updatePending((current) =>
            current.rest === entry ? { ...current, rest: null } : current,
          );
      setTimeout(drop, PENDING_MS);
      return drop;
    },
    [store],
  );

  /**
   * Shows the tick at once and writes it behind the earlier writes. The preview goes up before the
   * first await, so a caller can give its feedback in the same turn as the press; the result says
   * whether the write held (`null` when it failed), and the preview is taken back when it did not.
   */
  const tick = useCallback(
    async (
      setId: string,
      ghosts: Ghosts,
      restSeconds: number | null = null,
      expiresAt?: number,
      savingEdits?: Promise<boolean[]>,
    ) => {
      const set = readSet(setId);
      const at = store.getState().storedSets.get(setId);
      const now = Date.now();
      const change =
        at && set && expiresAt === undefined
          ? tickChange(set, at.type, ghosts, new Date(now).toISOString())
          : null;
      const undoSet = change ? putSet(setId, change, true) : () => undefined;
      const undoRest =
        change && restSeconds !== null
          ? putRest(restFrom(setId, restSeconds, now))
          : () => undefined;
      const result = await enqueueCompletion(async () => {
        await nudges.release();
        if (savingEdits) await savingEdits;
        return actions.tick(setId, ghosts, restSeconds, expiresAt);
      });
      const settlement = settleTick(result);
      if (!settlement.keepSet) undoSet();
      if (!settlement.keepRest) undoRest();
      return result;
    },
    [actions, enqueueCompletion, nudges, putSet, putRest, readSet, store],
  );

  const untick = useCallback(
    async (setId: string) => {
      const undoSet = putSet(setId, { completedAt: null }, true);
      const state = store.getState();
      const rest = state.pending.rest ? state.pending.rest.value : state.stored.rest;
      const undoRest = rest?.setId === setId ? putRest(null) : () => undefined;
      const wrote = await enqueueCompletion(async () => {
        await nudges.release();
        return actions.untick(setId);
      });
      if (!wrote) {
        undoSet();
        undoRest();
      }
      return wrote;
    },
    [actions, enqueueCompletion, nudges, putSet, putRest, store],
  );

  const skipRest = useCallback(
    async (sessionId: string) => {
      const undo = putRest(null);
      const skipped = await enqueueCompletion(async () => {
        await nudges.release();
        return actions.skipRest(sessionId);
      });
      if (!skipped) undo();
      else markRestEnded(sessionId);
      return skipped;
    },
    [actions, enqueueCompletion, nudges, putRest],
  );

  const nudgeRest = useCallback(
    (_sessionId: string, deltaSeconds: number) => {
      nudges.add(store.getState().session.rest, deltaSeconds, Date.now());
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
      readSet,
      editValues,
      awaitCompletions,
    }),
    [actions, tick, untick, skipRest, nudgeRest, readSet, editValues, awaitCompletions],
  );
}
