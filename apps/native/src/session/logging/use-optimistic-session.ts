import { markRestEnded } from "@/session/rest/rest-ended";
import { AppState } from "react-native";

import type { Ghosts } from "@workspace/shared";
import type { SessionDetail, SetPatch } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  NO_PENDING,
  previewValuePatch,
  restFrom,
  restKey,
  setKey,
  settled,
  tickChange,
  withPending,
  type Pending,
  type SetChange,
} from "./optimistic";
import { RestNudges } from "@/session/rest/rest-nudges";
import type { useSessionActions } from "@/session/screen/use-session-actions";

type Actions = ReturnType<typeof useSessionActions>;

/** A change the watch never confirms (a write that failed quietly) stops showing after this. */
const PENDING_MS = 5000;

/**
 * Shows ticks, unticks and Rest changes the moment they are made. The local database's watch takes
 * most of a second to deliver a write back, which made a tick feel ignored. Returns the Session to
 * show and the actions to use in place of `actions`; a write that fails takes its change back.
 */
export function useOptimisticSession(session: SessionDetail, actions: Actions) {
  const [pending, setPendingState] = useState<Pending>(NO_PENDING);
  const pendingRef = useRef(pending);
  const setPending = useCallback((update: (current: Pending) => Pending) => {
    const next = update(pendingRef.current);
    if (next === pendingRef.current) return;
    pendingRef.current = next;
    setPendingState(next);
  }, []);
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
  const stored = useRef(session);
  stored.current = session;
  const shownRef = useRef(session);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [restTarget, setRestTarget] = useState<SessionDetail["rest"] | undefined>();
  const [nudges] = useState(
    () => new RestNudges((delta) => actionsRef.current.nudgeRest(session.id, delta), setRestTarget),
  );
  useEffect(() => {
    nudges.observe(session.rest);
  }, [nudges, session.rest, restTarget]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void nudges.flush();
    });
    return () => {
      subscription.remove();
      void nudges.flush();
    };
  }, [nudges]);

  // The watch delivered: drop what it has caught up with.
  useEffect(() => {
    setPending((current) => settled(current, session));
  }, [session, setPending]);

  const shown = useMemo(() => {
    const result = withPending(session, pending);
    return restTarget === undefined ? result : { ...result, rest: restTarget };
  }, [session, pending, restTarget]);
  shownRef.current = shown;

  const storedSets = useMemo(
    () =>
      new Map(
        session.exercises.flatMap((exercise) =>
          exercise.sets.map((set) => [set.id, { set, type: exercise.type }] as const),
        ),
      ),
    [session.exercises],
  );
  const storedSetsRef = useRef(storedSets);
  storedSetsRef.current = storedSets;
  const readSet = useCallback((setId: string) => {
    const at = storedSetsRef.current.get(setId);
    if (!at) return null;
    const change = pendingRef.current.sets.get(setId)?.change;
    return change ? { ...at.set, ...change } : at.set;
  }, []);

  const putSet = useCallback(
    (setId: string, change: SetChange, awaitFields = false) => {
      const at = storedSetsRef.current.get(setId);
      if (!at) return () => undefined;
      const previous = pendingRef.current.sets.get(setId);
      const entry = {
        before: setKey(at.set),
        change: { ...previous?.change, ...change },
        awaitFields: awaitFields || previous?.awaitFields,
      };
      setPending((current) => ({ ...current, sets: new Map(current.sets).set(setId, entry) }));
      const drop = () =>
        setPending((current) => {
          if (current.sets.get(setId) !== entry) return current;
          const sets = new Map(current.sets);
          sets.delete(setId);
          return { ...current, sets };
        });
      setTimeout(drop, PENDING_MS);
      return drop;
    },
    [setPending],
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
      const entry = { before: restKey(stored.current.rest), value };
      setPending((current) => ({ ...current, rest: entry }));
      const drop = () =>
        setPending((current) => (current.rest === entry ? { ...current, rest: null } : current));
      setTimeout(drop, PENDING_MS);
      return drop;
    },
    [setPending],
  );

  const tick = useCallback(
    async (
      setId: string,
      ghosts: Ghosts,
      restSeconds: number | null = null,
      expiresAt?: number,
      savingEdits?: Promise<boolean[]>,
    ) => {
      const set = readSet(setId);
      const at = storedSetsRef.current.get(setId);
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
      if (!result || !result.ok || !result.wrote) {
        undoSet();
        undoRest();
      } else if (!result.rest) {
        undoRest();
      }
      return result;
    },
    [actions, enqueueCompletion, nudges, putSet, putRest, readSet],
  );

  const untick = useCallback(
    async (setId: string) => {
      const undoSet = putSet(setId, { completedAt: null }, true);
      const pendingRest = pendingRef.current.rest;
      const rest = pendingRest ? pendingRest.value : stored.current.rest;
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
    [actions, enqueueCompletion, nudges, putSet, putRest],
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
      nudges.add(shownRef.current.rest, deltaSeconds, Date.now());
    },
    [nudges],
  );

  const optimisticActions = useMemo(
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
  return { session: shown, actions: optimisticActions };
}
