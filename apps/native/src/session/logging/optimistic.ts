import {
  REST_SECONDS_MAX,
  SET_FIELDS,
  tickValues,
  type ExerciseType,
  type Ghosts,
  type SetField,
} from "@workspace/shared";
import type { SessionDetail, SessionSetDetail, SetPatch, TickResult } from "@workspace/sync";

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
  >
>;

type Rest = SessionDetail["rest"];

/**
 * Changes written but not yet back from the local database's watch, which can take most of a second
 * after the write. Each remembers the stored value it was made against (`before`): once the stored
 * value differs, the watch has caught up and the change is dropped.
 */
type PendingSet = {
  before: string;
  change: SetChange;
  /** A keypad save may echo before the tick. Keep the preview until all its fields arrive. */
  awaitFields?: boolean;
};

export type Pending = {
  sets: ReadonlyMap<string, PendingSet>;
  rest: { before: string; value: Rest } | null;
};

export const NO_PENDING: Pending = { sets: new Map(), rest: null };

/** What identifies a stored set's state for {@link Pending}. */
export function setKey(set: SessionSetDetail): string {
  return JSON.stringify([
    set.completedAt,
    set.weightKg,
    set.reps,
    set.durationS,
    set.distanceM,
    set.floors,
    set.steps,
    set.rpe,
    set.timerStartedAt,
  ]);
}

export const restKey = (rest: Rest): string => JSON.stringify(rest);

/** The Session as stored, with the pending changes the watch has not delivered yet on top. */
export function withPending(session: SessionDetail, pending: Pending): SessionDetail {
  const rest = pending.rest && pending.rest.before === restKey(session.rest) ? pending.rest : null;
  if (!rest && pending.sets.size === 0) return session;
  let changedSets = false;
  const exercises = session.exercises.map((exercise) => {
    let changed = false;
    const sets = exercise.sets.map((set) => {
      const entry = pending.sets.get(set.id);
      if (!entry || delivered(entry, set)) return set;
      changed = true;
      return { ...set, ...entry.change };
    });
    if (!changed) return exercise;
    changedSets = true;
    return { ...exercise, sets };
  });
  if (!rest && !changedSets) return session;
  return {
    ...session,
    exercises: changedSets ? exercises : session.exercises,
    rest: rest ? rest.value : session.rest,
  };
}

/** Drops the pending changes the stored Session has moved past; the same object if none. */
export function settled(pending: Pending, session: SessionDetail): Pending {
  if (pending === NO_PENDING) return pending;
  const stored = new Map(
    session.exercises.flatMap((exercise) => exercise.sets.map((set) => [set.id, set] as const)),
  );
  let changed = false;
  const sets = new Map(pending.sets);
  for (const [id, entry] of pending.sets) {
    const set = stored.get(id);
    if (!set || delivered(entry, set)) {
      sets.delete(id);
      changed = true;
    }
  }
  const restGone = pending.rest !== null && pending.rest.before !== restKey(session.rest);
  if (!changed && !restGone) return pending;
  return { sets, rest: restGone ? null : pending.rest };
}

function delivered(entry: PendingSet, set: SessionSetDetail): boolean {
  if (!entry.awaitFields) return entry.before !== setKey(set);
  // SAFETY: these entries are the own keys of a SetChange, all drawn from SessionSetDetail.
  const keys = Object.keys(entry.change) as (keyof SetChange)[];
  return keys.every((key) =>
    key === "completedAt"
      ? (set.completedAt === null) === (entry.change.completedAt === null)
      : set[key] === entry.change[key],
  );
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
}: SetPatch): SetChange {
  return {
    ...(weight_kg === undefined ? {} : { weightKg: weight_kg }),
    ...(reps === undefined ? {} : { reps }),
    ...(duration_s === undefined ? {} : { durationS: duration_s }),
    ...(distance_m === undefined ? {} : { distanceM: distance_m }),
    ...(floors === undefined ? {} : { floors }),
    ...(steps === undefined ? {} : { steps }),
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
  const values = result.values;
  return {
    kind: "ok",
    change: {
      completedAt: now,
      timerStartedAt: null,
      ...(values.weight_kg === undefined ? {} : { weightKg: values.weight_kg }),
      ...(values.reps === undefined ? {} : { reps: values.reps }),
      ...(values.duration_s === undefined ? {} : { durationS: values.duration_s }),
      ...(values.distance_m === undefined ? {} : { distanceM: values.distance_m }),
      ...(values.floors === undefined ? {} : { floors: values.floors }),
      ...(values.steps === undefined ? {} : { steps: values.steps }),
      ...(values.rpe === undefined ? {} : { rpe: values.rpe }),
    },
  };
}

/** The change a tick shows ahead of the store; null when the store will refuse or write nothing. */
export function tickChange(
  set: SessionSetDetail,
  type: ExerciseType,
  ghosts: Ghosts,
  now: string,
): SetChange | null {
  const preview = previewTick(set, type, ghosts, now);
  return preview.kind === "ok" ? preview.change : null;
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

/** The Rest a tick starts now, as the store will record it. */
export function restFrom(setId: string, seconds: number, nowMs: number): NonNullable<Rest> {
  return {
    setId,
    startedAt: new Date(nowMs).toISOString(),
    endsAt: new Date(nowMs + seconds * 1000).toISOString(),
  };
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
