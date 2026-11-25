import {
  SET_KINDS,
  gymGridsOf,
  loadRangesSchema,
  progresses,
  type LoadRange,
} from "@workspace/shared";
import { and, desc, eq, inArray, isNotNull, isNull, notInArray, or } from "drizzle-orm";

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
  const unit = readPreferencesRow(prefs).ui.weightUnit;
  if (gymId === null) return { unit, ...gymGridsOf({ settings: [], kit: [], unit }) };
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
    .where(or(eq(gymEquipment.gym_id, gymId), isDefault ? isNull(gymEquipment.gym_id) : undefined));
  const remembered = await tx
    .select({ exerciseId: exerciseSetting.exercise_id, barId: exerciseSetting.bar_id })
    .from(exerciseSetting)
    .where(isNotNull(exerciseSetting.bar_id));
  return {
    unit,
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

/**
 * The heaviest completed working set of the exercise's last baseline Session (a finished Session
 * that is not a Test or Deload), in kilograms; null when there is none. A Test week's top set
 * starts from it, not from the Workout's planned load, which may be long stale.
 */
export async function lastBaselineLoadKg(tx: Tx, exerciseId: string): Promise<number | null> {
  const rows = await tx
    .select({ sessionId: session.id, weightKg: sessionSet.weight_kg })
    .from(sessionSet)
    .innerJoin(sessionExercise, eq(sessionSet.session_exercise_id, sessionExercise.id))
    .innerJoin(session, eq(sessionExercise.session_id, session.id))
    .where(
      and(
        eq(sessionExercise.exercise_id, exerciseId),
        isNotNull(session.finished_at),
        isNotNull(sessionSet.completed_at),
        isNotNull(sessionSet.weight_kg),
        inArray(sessionSet.kind, PROGRESSING_KINDS),
        or(isNull(session.phase), notInArray(session.phase, ["test", "deload"])),
      ),
    )
    .orderBy(desc(session.started_at), desc(session.id))
    .limit(200);
  const latest = rows[0]?.sessionId;
  const loads = rows.flatMap((row) =>
    row.sessionId === latest && row.weightKg !== null ? [row.weightKg] : [],
  );
  return loads.length > 0 ? Math.max(...loads) : null;
}
