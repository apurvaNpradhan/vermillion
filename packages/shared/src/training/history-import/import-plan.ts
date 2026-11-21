import { z } from "zod";
import { sha256Hex } from "../../sha256";
import { SET_FIELDS, type ExerciseType } from "../../exercise/vocabulary";
import { sessionSetSchema, sessionStartAllowed } from "../logging/session-inputs";
import { KG_PER_LB } from "../vocabulary/format";
import { SESSION_LIMITS, type SetKind, type WeightUnit } from "../vocabulary/vocabulary";
import {
  type ImportFormat,
  type ImportedExercise,
  type ImportedSession,
  type ImportedSet,
} from "./parse-history";

import { normalizeExerciseName } from "./match-exercises";

/** What a file's exercise name was resolved to: a library exercise and its snapshot. */
export type ExerciseTarget = { exerciseId: string; title: string; type: ExerciseType };

/** A Logged set ready to write: ticked, every value the exercise type records filled in. */
export type PlannedImportSet = {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  rpe: number | null;
};

export type PlannedImportExercise = {
  exerciseId: string;
  title: string;
  type: ExerciseType;
  note: string | null;
  /** Exercises of the session that share a key were a superset; null when alone. */
  supersetKey: string | null;
  logEffort: boolean;
  sets: PlannedImportSet[];
};

export type PlannedImportSession = {
  key: string;
  fingerprint: string;
  title: string;
  note: string | null;
  /** UTC instant, ISO 8601. */
  startedAt: string;
  durationS: number | null;
  exercises: PlannedImportExercise[];
};

type OmittedRows = { omittedSets: number; omittedExercises: number };

/** A workout planned, or why it was left out, including any unusable or trimmed rows. */
export type PlanOutcome =
  | ({ kind: "planned"; session: PlannedImportSession } & OmittedRows)
  | { kind: "out_of_range" }
  | ({ kind: "empty" } & OmittedRows);

export const importDigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export function sourceFingerprint(format: ImportFormat, imported: ImportedSession): string {
  return sha256Hex(
    JSON.stringify([
      format,
      imported.startedAt,
      imported.exercises.map(({ name, sets }) => [
        normalizeExerciseName(name),
        sets.map(({ kind, weight, weightUnit, reps, durationS, distanceM, rpe }) => [
          kind,
          weight,
          weightUnit ?? null,
          reps,
          durationS,
          distanceM,
          rpe,
        ]),
      ]),
    ]),
  );
}

/** Exercise, set and photo ids are UUIDs. Sorting makes the membership test order independent. */
export function importContentDigest(ids: string[]): string {
  return sha256Hex(ids.sort().join(","));
}

const SAMPLE_IDS = {
  exercise: "00000000-0000-7000-8000-000000000000",
  time: "2026-01-01T00:00:00.000Z",
} as const;

const toKg = (weight: number, unit: WeightUnit) =>
  unit === "kg" ? weight : Number((weight * KG_PER_LB).toFixed(3));

/**
 * One imported set as the exercise's type records it, or null when it holds nothing usable. Values
 * the type does not record are left out; a weight the file lacks is 0 (the bar, no assistance)
 * when the type wants one and the set has its other values.
 */
export function fitSet(
  type: ExerciseType,
  set: ImportedSet,
  unit: WeightUnit,
): PlannedImportSet | null {
  if (set.invalid) return null;
  const fields: readonly string[] = SET_FIELDS[type];
  const planned: PlannedImportSet = {
    kind: set.kind,
    weightKg: fields.includes("weight") ? toKg(set.weight ?? 0, set.weightUnit ?? unit) : null,
    reps: fields.includes("reps") && set.reps !== null ? Math.round(set.reps) : null,
    durationS:
      fields.includes("duration") && set.durationS !== null ? Math.round(set.durationS) : null,
    distanceM: fields.includes("distance") ? set.distanceM : null,
    rpe: fields.includes("reps") ? set.rpe : null,
  };
  const valid = sessionSetSchema(type).safeParse({
    session_exercise_id: SAMPLE_IDS.exercise,
    position: "a0",
    kind: planned.kind,
    weight_kg: planned.weightKg,
    reps: planned.reps,
    duration_s: planned.durationS,
    distance_m: planned.distanceM,
    floors: null,
    steps: null,
    rpe: planned.rpe,
    completed_at: SAMPLE_IDS.time,
    timer_started_at: null,
    target: null,
  });
  return valid.success ? planned : null;
}

/** Whether a set holds no data at all, such as a bare row for an exercise with no sets logged. */
export function isBlankSet(set: ImportedSet): boolean {
  return [set.reps, set.durationS, set.distanceM].every((value) => (value ?? 0) === 0);
}

/**
 * Turns one imported workout into what the app writes: each exercise resolved by `resolve`
 * (a name with no target is left out), its sets fitted to the type, a workout outside the 10-year
 * window or without a usable set left out. `unit` is the file's weight unit.
 */
export function planSession(
  imported: ImportedSession,
  resolve: (name: string) => ExerciseTarget | null,
  unit: WeightUnit,
  fallbackTitle: string,
): PlanOutcome {
  const { startedAt } = imported;
  if (!sessionStartAllowed(startedAt)) return { kind: "out_of_range" };

  let omittedSets = 0;
  let omittedExercises = 0;
  const exercises: PlannedImportExercise[] = [];
  for (const entry of imported.exercises) {
    const target = resolve(entry.name);
    if (!target || exercises.length >= SESSION_LIMITS.exercisesPerSession) {
      omittedExercises += 1;
      omittedSets += entry.sets.length;
      continue;
    }
    const sets: PlannedImportSet[] = [];
    for (const set of entry.sets) {
      const fitted = fitSet(target.type, set, unit);
      if (fitted && sets.length < SESSION_LIMITS.setsPerExercise) sets.push(fitted);
      else omittedSets += 1;
    }
    if (sets.length === 0) omittedExercises += 1;
    else exercises.push(plannedExercise(entry, target, sets));
  }
  if (exercises.length === 0) return { kind: "empty", omittedSets, omittedExercises };
  keepSharedSupersets(exercises);

  const title = imported.title.trim().slice(0, SESSION_LIMITS.titleMax);
  return {
    kind: "planned",
    omittedSets,
    omittedExercises,
    session: {
      key: imported.key,
      fingerprint: sourceFingerprint(imported.format, imported),
      title: title === "" ? fallbackTitle : title,
      note: imported.note,
      startedAt,
      durationS:
        imported.durationS === null
          ? null
          : Math.min(Math.round(imported.durationS), SESSION_LIMITS.durationMaxSeconds),
      exercises,
    },
  };
}

function plannedExercise(
  entry: ImportedExercise,
  target: ExerciseTarget,
  sets: PlannedImportSet[],
): PlannedImportExercise {
  return {
    exerciseId: target.exerciseId,
    title: target.title,
    type: target.type,
    note: entry.note,
    supersetKey: entry.supersetKey,
    logEffort: sets.some((set) => set.rpe !== null),
    sets,
  };
}

/** A superset key held by one exercise alone means nothing, so it is cleared. */
function keepSharedSupersets(exercises: PlannedImportExercise[]) {
  const counts = new Map<string, number>();
  for (const entry of exercises) {
    if (entry.supersetKey !== null)
      counts.set(entry.supersetKey, (counts.get(entry.supersetKey) ?? 0) + 1);
  }
  for (const entry of exercises) {
    if (entry.supersetKey !== null && (counts.get(entry.supersetKey) ?? 0) < 2)
      entry.supersetKey = null;
  }
}
