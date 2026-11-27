import type { ExerciseType } from "../../exercise/vocabulary";
import type { ActualValues } from "./session-inputs";
import type { PlannedSet } from "../plans/planned-sets";
import type { Phase } from "../phases/phases";
import type { SetKind } from "../vocabulary/vocabulary";

/** The actuals of a set; absent and null both mean empty. */
export type SetValues = { [Key in keyof ActualValues]?: number | null };

/** One Logged set with what the numbers need to read it: its exercise and the snapshot type. */
export type LoggedSet = SetValues & {
  /** Computed on read from the weight log on this Session’s local date. */
  bodyweight_kg?: number | null;
  /** Prescription stored when the set was created. */
  target?: PlannedSet | null;
  /**
   * What was suggested for this set, from the Session's prescription snapshot: the load before any
   * same-day adjustment, and the reps; the reps asked past the top of the range, and whether the
   * rule reset the load, the share of a top set it was meant to be. Absent for a Session that has no snapshot.
   */
  suggested?: {
    weight_kg: number | null;
    reps: number | null;
    extraReps?: number;
    reset?: boolean;
    /** The share of the top set a back-off was meant to be, before rounding. */
    share?: number;
  } | null;
  /** This Session entry used the stall deload. */
  stall_deload?: boolean;
  /**
   * Set by the user's "Count warm-up sets" setting on the sets a stat reads: a warm-up with it
   * counts like a working set. Absent (the default) leaves warm-ups out of every number.
   */
  warmup_counted?: boolean;
  id: string;
  exercise_id: string;
  /** Distinguishes repeated entries of the same exercise in an imported or edited Session. */
  session_exercise_id?: string;
  /** Identifies the Workout entry across Sessions, when the Session came from a Workout. */
  source_workout_exercise_id?: string | null;
  exercise_type: ExerciseType;
  kind: SetKind;
  completed_at: string | null;
};

/** A Session with its Logged sets, in display order. Callers pass only live Sessions. */
export type SessionHistory = {
  id: string;
  started_at: string;
  finished_at: string | null;
  /** The gym trained at; absent or null for a Session with no gym (an older one). */
  gymId?: string | null;
  /** The phase the Session started in (Test and Deload are not a baseline); null for none. */
  phase?: Phase | null;
  sets: readonly LoggedSet[];
};

/**
 * A Counted set: ticked, and not a warm-up (unless the set carries `warmup_counted`).
 * Everything numeric uses only these.
 */
export function isCounted(
  set: Pick<LoggedSet, "completed_at" | "kind" | "warmup_counted">,
): boolean {
  return set.completed_at !== null && (set.kind !== "warmup" || set.warmup_counted === true);
}

/** Marks every warm-up of `sessions` as counted (or not), for the stats that read them. */
export function withWarmupsCounted<
  Session extends { sets: readonly Pick<LoggedSet, "kind" | "warmup_counted">[] },
>(sessions: readonly Session[], counted: boolean): Session[] {
  if (!counted) return [...sessions];
  return sessions.map((session) => ({
    ...session,
    sets: session.sets.map((set) =>
      set.kind === "warmup" ? { ...set, warmup_counted: true } : set,
    ),
  }));
}

/** Oldest first: by start time, then id, so two Sessions with one start still have an order. */
export function inSessionOrder<Session extends { id: string; started_at: string }>(
  sessions: readonly Session[],
): Session[] {
  // `sort` on a copy, not `toSorted`: Hermes on the device has no ES2023 array methods.
  return sessions
    .map((session) => ({ session, time: Date.parse(session.started_at) }))
    .sort((a, b) => {
      const byStart = a.time - b.time;
      if (byStart) return byStart;
      return a.session.id < b.session.id ? -1 : a.session.id > b.session.id ? 1 : 0;
    })
    .map(({ session }) => session);
}
