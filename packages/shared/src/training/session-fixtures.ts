import type { ExerciseType } from "../exercise/vocabulary";
import type { LoggedSet, SessionHistory } from "./logged-set";
import type { SetKind } from "./vocabulary";

let counter = 0;

/** A ticked working set of the bench by default; override anything. */
export function loggedSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  counter += 1;
  return {
    id: `set-${counter}`,
    exercise_id: "bench",
    exercise_type: "weight_reps",
    kind: "working",
    completed_at: "2026-01-01T10:00:00.000Z",
    weight_kg: 100,
    reps: 5,
    ...overrides,
  };
}

export function untickedSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return loggedSet({ completed_at: null, ...overrides });
}

export function sessionOf(
  id: string,
  startedAt: string,
  sets: LoggedSet[],
  finished: boolean = true,
): SessionHistory {
  return {
    id,
    started_at: startedAt,
    finished_at: finished ? startedAt : null,
    sets,
  };
}

export function setOf(type: ExerciseType, kind: SetKind, values: Partial<LoggedSet>): LoggedSet {
  return loggedSet({ exercise_type: type, kind, ...values });
}
