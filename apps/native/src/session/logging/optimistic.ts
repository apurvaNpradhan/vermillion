import {
  REST_SECONDS_MAX,
  SET_FIELDS,
  tickValues,
  type ExerciseType,
  type Ghosts,
  type SetField,
  type SessionClock,
} from "@workspace/shared";
import type { SessionDetail, SessionSetDetail, SetPatch, TickResult } from "@workspace/sync";

import { deepEqual } from "../store/equal";

/** The parts of a set a tick or untick changes. */
export type SetChange = Partial<
  Pick<
    SessionSetDetail,
    | "completedAt"
    | "weightKg"
    | "reps"
    | "durationS"
    | "distanceM"
    | "floors"
    | "steps"
    | "rpe"
    | "timerStartedAt"
    | "kind"
  >
>;

type Rest = SessionDetail["rest"];

export type RestChange = { value: Rest } | { clearFor: string };

type Change<T, Before> = { value: T; before: Before };

export type PendingWrite = {
  id: symbol;
  saved?: boolean;
  set?: Change<SetChange, SessionSetDetail> & { id: string };
  rest?: Change<RestChange, Rest>;
  clock?: SessionClock;
};

export type Pending = readonly PendingWrite[];

export const NO_PENDING: Pending = [];

function applyRest(rest: Rest, change: RestChange): Rest {
  return "value" in change ? change.value : rest?.setId === change.clearFor ? null : rest;
}

/** Projects writes in press order, so removing one write leaves the others in place. */
export function withPending(session: SessionDetail, pending: Pending): SessionDetail {
  if (pending.length === 0) return session;
  const patches = new Map<string, SetChange>();
  let rest = session.rest;
  for (const write of pending) {
    if (write.set) {
      const { id, value } = write.set;
      patches.set(id, { ...patches.get(id), ...value });
    }
    if (write.rest) rest = applyRest(rest, write.rest.value);
  }
  if (patches.size === 0) return rest === session.rest ? session : { ...session, rest };
  const exercises = session.exercises.map((exercise) => {
    if (!exercise.sets.some((set) => patches.has(set.id))) return exercise;
    const sets = exercise.sets.map((set) => {
      const patch = patches.get(set.id);
      return patch ? { ...set, ...patch } : set;
    });
    return { ...exercise, sets };
  });
  return { ...session, exercises, rest };
}

/** The last committed state, including writes the watch has yet to deliver. */
export function savedSession({ stored, pending }: { stored: SessionDetail; pending: Pending }) {
  return withPending(
    stored,
    pending.filter((write) => write.saved),
  );
}

const matches = (set: SessionSetDetail, patch: SetChange) =>
  // SAFETY: patch is constructed from the properties of SetChange.
  (Object.keys(patch) as (keyof SetChange)[]).every((field) => Object.is(set[field], patch[field]));

/**
 * A watch can skip intermediate writes. Match the latest saved prefix for each affected set and
 * for Rest. A snapshot equal to the original baseline may predate every write in that prefix.
 */
export function settled(pending: Pending, session: SessionDetail): Pending {
  if (!pending.some((write) => write.saved)) return pending;
  const stored = new Map(
    session.exercises.flatMap((exercise) => exercise.sets.map((set) => [set.id, set] as const)),
  );
  const confirmedSets = new Map<string, number>();
  const setPrefixes = new Map<string, Change<SetChange, SessionSetDetail>>();
  const blockedSets = new Set<string>();
  let confirmedRest = -1;
  let restPrefix: Change<Rest, Rest> | undefined;
  let restBlocked = false;

  pending.forEach((write, index) => {
    if (write.set) {
      const { id, value, before } = write.set;
      const set = stored.get(id);
      if (!set) confirmedSets.set(id, index);
      else if (!write.saved) blockedSets.add(id);
      else if (!blockedSets.has(id)) {
        const prefix = setPrefixes.get(id);
        const merged = { ...prefix?.value, ...value };
        const baseline = prefix?.before ?? before;
        setPrefixes.set(id, { value: merged, before: baseline });
        if (matches(set, merged) && !matches(baseline, merged)) confirmedSets.set(id, index);
      }
    }
    if (write.rest) {
      if (!write.saved) restBlocked = true;
      else if (!restBlocked) {
        const baseline = restPrefix ? restPrefix.before : write.rest.before;
        const value = applyRest(restPrefix ? restPrefix.value : baseline, write.rest.value);
        restPrefix = { before: baseline, value };
        // Nudging a rest keeps its start; the first echo may already include the adjustment.
        const sameStart =
          value !== null &&
          session.rest?.setId === value.setId &&
          session.rest.startedAt === value.startedAt;
        if ((sameStart || deepEqual(session.rest, value)) && !deepEqual(baseline, value))
          confirmedRest = index;
      }
    }
  });

  let changed = false;
  const next = pending.flatMap((write, index) => {
    const set =
      write.set && index > (confirmedSets.get(write.set.id) ?? -1) ? write.set : undefined;
    const rest = index > confirmedRest ? write.rest : undefined;
    const clock =
      write.saved &&
      write.clock &&
      (session.finishedAt !== null ||
        (session.pausedAt === null) === (write.clock.pausedAt === null))
        ? undefined
        : write.clock;
    if (set === write.set && rest === write.rest && clock === write.clock) return [write];
    changed = true;
    return set || rest || clock || !write.saved ? [{ ...write, set, rest, clock }] : [];
  });
  return changed ? next : pending;
}

export function previewValuePatch({
  weight_kg,
  reps,
  duration_s,
  distance_m,
  floors,
  steps,
  rpe,
  timer_started_at,
  kind,
}: SetPatch): SetChange {
  return {
    ...(weight_kg === undefined ? {} : { weightKg: weight_kg }),
    ...(reps === undefined ? {} : { reps }),
    ...(duration_s === undefined ? {} : { durationS: duration_s }),
    ...(distance_m === undefined ? {} : { distanceM: distance_m }),
    ...(floors === undefined ? {} : { floors }),
    ...(steps === undefined ? {} : { steps }),
    ...(kind === undefined ? {} : { kind }),
    ...(rpe === undefined ? {} : { rpe }),
    ...(timer_started_at === undefined ? {} : { timerStartedAt: timer_started_at }),
  };
}

/** What pressing the tick will do, worked out the way the store does it. */
export type TickPreview =
  | { kind: "noop" }
  | { kind: "refused"; missing: SetField[] }
  | { kind: "ok"; change: SetChange };

/**
 * What a tick will store: empty cells adopt their Ghost values. `refused` when a required cell has
 * no value, `noop` when the set is already ticked; in both nothing is shown ahead of the store.
 */
export function previewTick(
  set: SessionSetDetail,
  type: ExerciseType,
  ghosts: Ghosts,
  now: string,
): TickPreview {
  if (set.completedAt !== null) return { kind: "noop" };
  const result = tickValues(
    {
      weight_kg: set.weightKg,
      reps: set.reps,
      duration_s: set.durationS,
      distance_m: set.distanceM,
      floors: set.floors,
      steps: set.steps,
      rpe: set.rpe,
    },
    ghosts,
    SET_FIELDS[type],
  );
  if (!result.ok) return { kind: "refused", missing: result.missing };
  return {
    kind: "ok",
    change: { ...previewValuePatch(result.values), completedAt: now, timerStartedAt: null },
  };
}

/**
 * What a finished tick write means for the preview shown ahead of it. A failed write (null), a
 * refusal and a write that changed nothing all take the preview back; a Rest the store did not
 * start takes back only the Rest.
 */
export type TickSettlement = {
  outcome: "recorded" | "unchanged" | "refused" | "failed";
  keepSet: boolean;
  keepRest: boolean;
};

export function settleTick(result: TickResult | null): TickSettlement {
  if (result === null) return { outcome: "failed", keepSet: false, keepRest: false };
  if (!result.ok) return { outcome: "refused", keepSet: false, keepRest: false };
  if (!result.wrote) return { outcome: "unchanged", keepSet: false, keepRest: false };
  return { outcome: "recorded", keepSet: true, keepRest: result.rest !== undefined };
}

/** The running Rest moved by `deltaSeconds`; null once it is pushed to or past now. */
export function nudged(rest: Rest, deltaSeconds: number, nowMs: number): Rest {
  if (!rest) return null;
  const end = Math.min(
    Date.parse(rest.endsAt) + deltaSeconds * 1000,
    nowMs + REST_SECONDS_MAX * 1000,
  );
  return end <= nowMs ? null : { ...rest, endsAt: new Date(end).toISOString() };
}
