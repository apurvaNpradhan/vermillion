import {
  SET_KINDS,
  gymGridsOf,
  calendarDay,
  testWorkingLoad,
  type ExerciseType,
  type Phase,
  loadRangesSchema,
  progresses,
  type LoadRange,
} from "@workspace/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { bodyMeasurement } from "../../body";
import { readPreferencesRow, userPreferences } from "../../preferences";
import { defaultGymIdOf } from "../gyms/gym-store";
import { ownerOf, type Tx } from "../store-common";
import {
  exerciseSetting,
  gym,
  gymEquipment,
  gymExerciseSetting,
  session,
  sessionExercise,
  sessionSet,
} from "../tables";

/**
 * What a Session's phase needs to adjust loads as it starts: the user's weight unit and the loads
 * the Session's gym can make for each exercise, read inside the starting transaction so the
 * Session starts on the same loads the screens show.
 */
export async function phaseLoadsIn(tx: Tx, gymId: string | null) {
  const userId = await ownerOf(tx);
  const [prefs] = await tx
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId))
    .orderBy(desc(userPreferences.id))
    .limit(1);
  const { weightUnit: unit, lighterWeeks } = readPreferencesRow(prefs).ui;
  if (gymId === null) return { unit, lighterWeeks, ...gymGridsOf({ settings: [], kit: [], unit }) };
  const [row] = await tx
    .select({ dumbbell_max_kg: gym.dumbbell_max_kg })
    .from(gym)
    .where(eq(gym.id, gymId))
    .limit(1);
  const isDefault = (await defaultGymIdOf(tx)) === gymId;
  const settings = await tx
    .select({
      exerciseId: gymExerciseSetting.exercise_id,
      loadRanges: gymExerciseSetting.load_ranges,
    })
    .from(gymExerciseSetting)
    .where(eq(gymExerciseSetting.gym_id, gymId));
  const kit = await tx
    .select()
    .from(gymEquipment)
    .where(or(eq(gymEquipment.gym_id, gymId), isDefault ? isNull(gymEquipment.gym_id) : undefined))
    // The screens' order, so the default bar is the same one they pick.
    .orderBy(asc(gymEquipment.kind), desc(gymEquipment.weight_kg), asc(gymEquipment.id));
  const remembered = await tx
    .select({ exerciseId: exerciseSetting.exercise_id, barId: exerciseSetting.bar_id })
    .from(exerciseSetting)
    .where(isNotNull(exerciseSetting.bar_id));
  return {
    unit,
    lighterWeeks,
    ...gymGridsOf({
      settings: settings.map((setting) => ({
        exerciseId: setting.exerciseId,
        loadRanges: readRanges(setting.loadRanges),
      })),
      kit: kit.map((item) => ({
        id: item.id,
        kind: item.kind,
        weightKg: item.weight_kg,
        unit: item.unit,
        label: item.label,
        count: item.count,
        enabled: item.enabled,
      })),
      bars: new Map(
        remembered.flatMap((item) => (item.barId === null ? [] : [[item.exerciseId, item.barId]])),
      ),
      unit,
      dumbbellMaxKg: row?.dumbbell_max_kg ?? null,
    }),
  };
}

/** Ranges as stored; anything unreadable is no ranges, never an error. */
function readRanges(value: LoadRange[]): LoadRange[] {
  const parsed = loadRangesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

const PROGRESSING_KINDS = SET_KINDS.filter(progresses);

/** Test inputs from the exact transaction starting the Session. */
export async function testWorkingLoadIn(
  tx: Tx,
  exerciseId: string,
  type: ExerciseType,
  options: Parameters<typeof testWorkingLoad>[2] & { timeZone: string },
): Promise<number | null> {
  const rows = await tx
    .select({
      id: session.id,
      started_at: session.started_at,
      phase: session.phase,
      kind: sessionSet.kind,
      weight_kg: sessionSet.weight_kg,
      reps: sessionSet.reps,
      rpe: sessionSet.rpe,
      completed_at: sessionSet.completed_at,
    })
    .from(sessionSet)
    .innerJoin(sessionExercise, eq(sessionSet.session_exercise_id, sessionExercise.id))
    .innerJoin(session, eq(sessionExercise.session_id, session.id))
    .where(
      and(
        eq(sessionExercise.exercise_id, exerciseId),
        isNotNull(session.finished_at),
        isNotNull(sessionSet.completed_at),
        lte(session.started_at, options.now.toISOString()),
        inArray(sessionSet.kind, PROGRESSING_KINDS),
      ),
    )
    .orderBy(desc(session.started_at), desc(session.id))
    .limit(500);

  const dateOf = (at: string | Date) =>
    new Date(calendarDay(at, options.timeZone)).toISOString().slice(0, 10);
  const today = dateOf(options.now);
  const weights = new Map<string, number>();
  if (type === "bodyweight_weighted_reps") {
    const days = [...new Set([today, ...rows.map(({ started_at }) => dateOf(started_at))])];
    const measurements = await tx.all<{ day: string; kg: number }>(sql`
      WITH days AS (
        SELECT date.value AS day, COALESCE(
          (SELECT MAX(local_date) FROM ${bodyMeasurement} WHERE metric = 'weight' AND local_date <= date.value),
          (SELECT MIN(local_date) FROM ${bodyMeasurement} WHERE metric = 'weight')
        ) AS measured_day FROM json_each(${JSON.stringify(days)}) AS date
      )
      SELECT days.day, AVG(m.value) AS kg FROM days
      JOIN ${bodyMeasurement} m ON m.metric = 'weight' AND m.local_date = days.measured_day
      GROUP BY days.day
    `);
    for (const { day, kg } of measurements) weights.set(day, kg);
  }
  const history = new Map<
    string,
    {
      started_at: string;
      phase: Phase | null;
      sets: ((typeof rows)[number] & { bodyweight_kg?: number | null })[];
    }
  >();
  for (const row of rows) {
    const grouped = history.get(row.id) ?? {
      started_at: row.started_at,
      phase: row.phase,
      sets: [],
    };
    grouped.sets.push({ ...row, bodyweight_kg: weights.get(dateOf(row.started_at)) ?? null });
    history.set(row.id, grouped);
  }
  return testWorkingLoad([...history.values()], type, {
    ...options,
    bodyweightKg: weights.get(today),
  });
}
