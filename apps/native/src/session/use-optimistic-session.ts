import { markRestEnded } from "./rest-ended";
import { AppState } from "react-native";

import type { Ghosts } from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  NO_PENDING,
  restFrom,
  restKey,
  setKey,
  settled,
  tickChange,
  withPending,
  type Pending,
  type SetChange,
} from "./optimistic";
import { RestNudges } from "./rest-nudges";
import type { useSessionActions } from "./use-session-actions";

type Actions = ReturnType<typeof useSessionActions>;

/** A change the watch never confirms (a write that failed quietly) stops showing after this. */
const PENDING_MS = 5000;

/**
 * Shows ticks, unticks and Rest changes the moment they are made. The local database's watch takes
 * most of a second to deliver a write back, which made a tick feel ignored. Returns the Session to
 * show and the actions to use in place of `actions`; a write that fails takes its change back.
 */
export function useOptimisticSession(session: SessionDetail, actions: Actions) {
  const [pending, setPending] = useState<Pending>(NO_PENDING);
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
  }, [session]);

  const shown = useMemo(() => {
    const result = withPending(session, pending);
    return restTarget === undefined ? result : { ...result, rest: restTarget };
  }, [session, pending, restTarget]);
  shownRef.current = shown;

  const putSet = useCallback((setId: string, change: SetChange | null) => {
    const set = stored.current.exercises
      .flatMap((exercise) => exercise.sets)
      .find((entry) => entry.id === setId);
    if (!set) return () => undefined;
    const entry = change ? { before: setKey(set), change } : null;
    setPending((current) => {
      const sets = new Map(current.sets);
      if (entry) sets.set(setId, entry);
      else sets.delete(setId);
      return { ...current, sets };
    });
    const drop = () =>
      setPending((current) => {
        if (!entry || current.sets.get(setId) !== entry) return current;
        const sets = new Map(current.sets);
        sets.delete(setId);
        return { ...current, sets };
      });
    setTimeout(drop, PENDING_MS);
    return drop;
  }, []);

  const putRest = useCallback((value: SessionDetail["rest"]) => {
    const entry = { before: restKey(stored.current.rest), value };
    setPending((current) => ({ ...current, rest: entry }));
    const drop = () =>
      setPending((current) => (current.rest === entry ? { ...current, rest: null } : current));
    setTimeout(drop, PENDING_MS);
    return drop;
  }, []);

  const tick = useCallback(
    async (setId: string, ghosts: Ghosts, restSeconds: number | null = null) => {
      await nudges.release();
      const exercise = stored.current.exercises.find((entry) =>
        entry.sets.some((set) => set.id === setId),
      );
      const set = exercise?.sets.find((entry) => entry.id === setId);
      const now = Date.now();
      const change =
        exercise && set
          ? tickChange(set, exercise.type, ghosts, new Date(now).toISOString())
          : null;
      const undoSet = change ? putSet(setId, change) : () => undefined;
      const undoRest =
        change && restSeconds !== null
          ? putRest(restFrom(setId, restSeconds, now))
          : () => undefined;
      const result = await actions.tick(setId, ghosts, restSeconds);
      if (!result || !result.ok || !result.wrote) {
        undoSet();
        undoRest();
      } else if (!result.rest) {
        undoRest();
      }
      return result;
    },
    [actions, nudges, putSet, putRest],
  );

  const untick = useCallback(
    async (setId: string) => {
      await nudges.release();
      const undoSet = putSet(setId, { completedAt: null });
      const undoRest = stored.current.rest?.setId === setId ? putRest(null) : () => undefined;
      const wrote = await actions.untick(setId);
      if (!wrote) {
        undoSet();
        undoRest();
      }
      return wrote;
    },
    [actions, nudges, putSet, putRest],
  );

  const skipRest = useCallback(
    async (sessionId: string) => {
      await nudges.release();
      const undo = putRest(null);
      const skipped = await actions.skipRest(sessionId);
      if (!skipped) undo();
      else markRestEnded(sessionId);
      return skipped;
    },
    [actions, nudges, putRest],
  );

  const nudgeRest = useCallback(
    (_sessionId: string, deltaSeconds: number) => {
      nudges.add(shownRef.current.rest, deltaSeconds, Date.now());
    },
    [nudges],
  );

  const optimisticActions = useMemo(
    () => ({ ...actions, tick, untick, skipRest, nudgeRest }),
    [actions, tick, untick, skipRest, nudgeRest],
  );
  return { session: shown, actions: optimisticActions };
}
