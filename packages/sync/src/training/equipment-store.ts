import { v7 as uuidv7 } from "uuid";

import { exerciseSettingInput, gymEquipmentInput } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { changedFields, nowIso, ownerOf, write, type TrainingDatabase } from "./store-common";
import { exerciseSetting, gymEquipment } from "./tables";

const equipmentItem = gymEquipmentInput.extend({ id: z.uuid().optional() });
/** A bar or plate to write; with an `id` it updates that item (only what changed). */
export type EquipmentItem = z.input<typeof equipmentItem>;

/**
 * Adds or updates bars and plates of the user's kit in one transaction, for the default kit on
 * first use, a custom item, or toggling one (`enabled`). An item with an id that is not on this
 * device yet is created under that id. Returns the ids in order.
 */
export async function upsertEquipment(
  database: TrainingDatabase,
  items: readonly EquipmentItem[],
  expectedInstallId?: string,
): Promise<string[]> {
  const parsed = items.map((item) => equipmentItem.parse(item));
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const ids: string[] = [];
    for (const { id: given, ...values } of parsed) {
      const id = given ?? uuidv7();
      ids.push(id);
      const [current] = await tx
        .select()
        .from(gymEquipment)
        .where(eq(gymEquipment.id, id))
        .limit(1);
      if (!current) {
        await tx
          .insert(gymEquipment)
          .values({ id, user_id: userId, created_at: nowIso(), ...values });
        continue;
      }
      const changes = changedFields(current, values);
      if (Object.keys(changes).length > 0) {
        await tx.update(gymEquipment).set(changes).where(eq(gymEquipment.id, id));
      }
    }
    return ids;
  });
}

const settingPatch = exerciseSettingInput.omit({ exercise_id: true }).partial();
/** What an exercise remembers: the bar and whether the effort column is on. */
export type ExerciseSettingPatch = z.infer<typeof settingPatch>;

/**
 * Sets what an exercise remembers, creating its one setting row on first use and changing only
 * what differs afterwards. Returns the setting's id.
 */
export async function setExerciseSetting(
  database: TrainingDatabase,
  exerciseId: string,
  patch: ExerciseSettingPatch,
  expectedInstallId?: string,
): Promise<string> {
  const fields = settingPatch.parse(patch);
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const [current] = await tx
      .select()
      .from(exerciseSetting)
      .where(eq(exerciseSetting.exercise_id, exerciseId))
      .limit(1);
    if (!current) {
      const values = exerciseSettingInput.parse({
        exercise_id: exerciseId,
        bar_id: null,
        log_effort: false,
        ...fields,
      });
      const id = uuidv7();
      await tx
        .insert(exerciseSetting)
        .values({ id, user_id: userId, created_at: nowIso(), ...values });
      return id;
    }
    const changes = changedFields(current, fields);
    if (Object.keys(changes).length > 0) {
      await tx.update(exerciseSetting).set(changes).where(eq(exerciseSetting.id, current.id));
    }
    return current.id;
  });
}
