import type { ExerciseType } from "../../exercise/vocabulary";
import type { ActualValues } from "./session-inputs";
import type { SetKind } from "../vocabulary/vocabulary";

/** The actuals of a set; absent and null both mean empty. */
export type SetValues = { [Key in keyof ActualValues]?: number | null };

/** One Logged set with what the numbers need to read it: its exercise and the snapshot type. */
export type LoggedSet = SetValues & {
  /** Computed on read from the weight log on this Session’s local date. */
  bodyweight_kg?: number | null;
  /**
   * Set by the user's "Count warm-up sets" setting on the sets a stat reads: a warm-up with it
   * counts like a working set. Absent (the default) leaves warm-ups out of every number.
   */
  warmup_counted?: boolean;
  id: string;
  exercise_id: string;
  exercise_type: ExerciseType;
  kind: SetKind;
  completed_at: string | null;
};

/** A Session with its Logged sets, in display order. Callers pass only live Sessions. */
export type SessionHistory = {
  id: string;
  started_at: string;
  finished_at: string | null;
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
export function withWarmupsCounted<Session extends { sets: readonly LoggedSet[] }>(
  sessions: readonly Session[],
  counted: boolean,
): Session[] {
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
  return [...sessions].sort((a, b) => {
    const byStart = Date.parse(a.started_at) - Date.parse(b.started_at);
    if (byStart !== 0) return byStart;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
