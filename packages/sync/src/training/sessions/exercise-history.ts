import { withWarmupsCounted, type ExerciseType } from "@workspace/shared";

import { readBodyweightsOnDates } from "../../body";
import type { TrainingDatabase } from "../store-common";
import { EXERCISE_HISTORY_SQL, parseFinishedSessions, type FinishedSession } from "./session-watch";

/** What reading an exercise's history for a prescription needs of the account. */
export type ExerciseHistoryOptions = {
  type: ExerciseType;
  /** The "Count warm-up sets" preference. */
  countWarmups?: boolean;
  timeZone?: string;
  /** The bodyweight preference, for a Session with no weigh-in on its day. */
  bodyweightKg: number | null;
};

/**
 * One exercise's finished Sessions, newest first, as every surface that reads from the database
 * (the live notification, a Session start) hands them to the engine: warm-ups counted when the
 * preference says so, and a weighted bodyweight lift with the bodyweight of each Session's day.
 * The Session screen and the Workout preview read the same rows through their watches.
 */
export async function loadExerciseHistory(
  db: TrainingDatabase,
  exerciseId: string,
  options: ExerciseHistoryOptions,
): Promise<FinishedSession[]> {
  const rows = parseFinishedSessions(
    await db.getAll(EXERCISE_HISTORY_SQL, [exerciseId, exerciseId]),
  );
  const history = options.countWarmups ? withWarmupsCounted(rows, true) : rows;
  if (options.type !== "bodyweight_weighted_reps" || history.length === 0) return history;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: options.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const days = history.map((item) => {
    const parts = formatter.formatToParts(new Date(item.started_at));
    return ["year", "month", "day"]
      .map((key) => parts.find((part) => part.type === key)?.value)
      .join("-");
  });
  const weights = await readBodyweightsOnDates(db, [...new Set(days)]);
  return history.map((item, index) => ({
    ...item,
    sets: item.sets.map((set) => ({
      ...set,
      bodyweight_kg: weights.get(days[index] ?? "") ?? options.bodyweightKg,
    })),
  }));
}
