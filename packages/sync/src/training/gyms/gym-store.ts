import { v7 as uuidv7 } from "uuid";

import {
  gymExerciseSettingInput,
  gymInput,
  loadRangesSchema,
  type LoadRange,
} from "@workspace/shared";
import { and, asc, count, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { readPreferencesRow, userPreferences } from "../../preferences";
import { changedFields, nowIso, ownerOf, write, type TrainingDatabase } from "../store-common";
import { gym, gymEquipment, gymExerciseSetting, session } from "../tables";

type Tx = Parameters<Parameters<typeof write>[2]>[0];

/**
 * The oldest gym: the one rows from before gyms existed (a null `gym_id`) belong to, and the
 * active one when the saved choice is gone. Null before the first sync has delivered "My gym".
 */
export async function defaultGymIdOf(tx: Tx): Promise<string | null> {
  const [first] = await tx
    .select({ id: gym.id })
    .from(gym)
    .orderBy(asc(gym.created_at), asc(gym.id))
    .limit(1);
  return first?.id ?? null;
}

/**
 * The gym the user trains at: the saved choice when that gym still exists, else the default one.
 * Null before the first sync has delivered "My gym".
 */
export async function activeGymIdOf(tx: Tx): Promise<string | null> {
  const userId = await ownerOf(tx);
  const [row] = await tx
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId))
    .orderBy(desc(userPreferences.id))
    .limit(1);
  const chosen = readPreferencesRow(row).ui.activeGymId;
  if (chosen) {
    const [found] = await tx.select({ id: gym.id }).from(gym).where(eq(gym.id, chosen)).limit(1);
    if (found) return found.id;
  }
  return defaultGymIdOf(tx);
}

/**
 * Makes a gym with a copy of `copyKitFrom`'s bars and plates (a new gym starts with the kit of the
 * one the user trains at). It does not become the active gym. Returns the new id.
 */
export async function createGym(
  database: TrainingDatabase,
  input: { name: string; copyKitFrom: string | null },
  scope: string,
): Promise<string> {
  const values = gymInput.parse({ name: input.name });
  return write(database, scope, async (tx) => {
    const userId = await ownerOf(tx);
    const id = uuidv7();
    await tx.insert(gym).values({ id, user_id: userId, name: values.name, created_at: nowIso() });
    if (input.copyKitFrom) {
      const isDefault = (await defaultGymIdOf(tx)) === input.copyKitFrom;
      const kit = await tx
        .select()
        .from(gymEquipment)
        .where(
          or(
            eq(gymEquipment.gym_id, input.copyKitFrom),
            isDefault ? isNull(gymEquipment.gym_id) : undefined,
          ),
        );
      for (const item of kit) {
        await tx.insert(gymEquipment).values({
          id: uuidv7(),
          user_id: userId,
          gym_id: id,
          kind: item.kind,
          weight_kg: item.weight_kg,
          unit: item.unit,
          label: item.label,
          count: item.count,
          enabled: item.enabled,
          created_at: nowIso(),
        });
      }
    }
    return id;
  });
}

/** Renames a gym. False when it is gone. */
export async function renameGym(
  database: TrainingDatabase,
  id: string,
  name: string,
  scope: string,
): Promise<boolean> {
  const values = gymInput.parse({ name });
  return write(database, scope, async (tx) => {
    const [current] = await tx.select().from(gym).where(eq(gym.id, id)).limit(1);
    if (!current) return false;
    if (current.name !== values.name)
      await tx.update(gym).set({ name: values.name }).where(eq(gym.id, id));
    return true;
  });
}

/**
 * Deletes a gym, its kit and its exercise settings. The Sessions trained there stay; they read
 * as "any gym" (the server nulls their `gym_id`, and readers ignore a gym that is gone). The last
 * gym cannot be deleted: false.
 */
export async function deleteGym(
  database: TrainingDatabase,
  id: string,
  scope: string,
): Promise<boolean> {
  return write(database, scope, async (tx) => {
    const [total] = await tx.select({ value: count() }).from(gym);
    const [current] = await tx.select({ id: gym.id }).from(gym).where(eq(gym.id, id)).limit(1);
    if (!current || (total?.value ?? 0) <= 1) return false;
    const isDefault = (await defaultGymIdOf(tx)) === id;
    await tx
      .delete(gymEquipment)
      .where(or(eq(gymEquipment.gym_id, id), isDefault ? isNull(gymEquipment.gym_id) : undefined));
    await tx.delete(gymExerciseSetting).where(eq(gymExerciseSetting.gym_id, id));
    await tx.delete(gym).where(eq(gym.id, id));
    return true;
  });
}

/**
 * Sets the gym a Session was trained at (null for any gym). It stays a plain reference, so a
 * gym id that is not on this device yet is kept.
 */
export async function setSessionGym(
  database: TrainingDatabase,
  sessionId: string,
  gymId: string | null,
  scope: string,
): Promise<boolean> {
  const parsed = z.uuid().nullable().parse(gymId);
  return write(database, scope, async (tx) => {
    const [current] = await tx
      .select({ gym_id: session.gym_id })
      .from(session)
      .where(eq(session.id, sessionId))
      .limit(1);
    if (!current) return false;
    if (current.gym_id !== parsed)
      await tx.update(session).set({ gym_id: parsed }).where(eq(session.id, sessionId));
    return true;
  });
}

const settingPatch = z.strictObject({
  load_ranges: loadRangesSchema.optional(),
  setup_note: gymExerciseSettingInput.shape.setup_note.optional(),
});
/** What a gym says about an exercise: the loads it can make (the last `max` is the cap) and a note. */
export type GymExerciseSettingPatch = {
  load_ranges?: LoadRange[];
  setup_note?: string | null;
};

/**
 * Sets what one gym says about one exercise, creating the row on first use and changing only the
 * given fields. A row left with no ranges and no note is deleted. Returns the row's id, or null
 * when it was removed.
 */
export async function setGymExerciseSetting(
  database: TrainingDatabase,
  target: { gymId: string; exerciseId: string },
  patch: GymExerciseSettingPatch,
  scope: string,
): Promise<string | null> {
  const fields = settingPatch.parse(patch);
  return write(database, scope, async (tx) => {
    const userId = await ownerOf(tx);
    const [current] = await tx
      .select()
      .from(gymExerciseSetting)
      .where(
        and(
          eq(gymExerciseSetting.gym_id, target.gymId),
          eq(gymExerciseSetting.exercise_id, target.exerciseId),
        ),
      )
      .limit(1);
    const merged = {
      load_ranges: fields.load_ranges ?? current?.load_ranges ?? [],
      setup_note:
        fields.setup_note === undefined ? (current?.setup_note ?? null) : fields.setup_note,
    };
    const empty = merged.load_ranges.length === 0 && (merged.setup_note ?? "").trim() === "";
    if (!current) {
      if (empty) return null;
      const values = gymExerciseSettingInput.parse({
        gym_id: target.gymId,
        exercise_id: target.exerciseId,
        ...merged,
      });
      const id = uuidv7();
      await tx
        .insert(gymExerciseSetting)
        .values({ id, user_id: userId, created_at: nowIso(), ...values });
      return id;
    }
    if (empty) {
      await tx.delete(gymExerciseSetting).where(eq(gymExerciseSetting.id, current.id));
      return null;
    }
    const changes = changedFields(current, fields);
    if (Object.keys(changes).length > 0)
      await tx.update(gymExerciseSetting).set(changes).where(eq(gymExerciseSetting.id, current.id));
    return current.id;
  });
}
