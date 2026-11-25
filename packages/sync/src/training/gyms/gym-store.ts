import { v7 as uuidv7 } from "uuid";

import {
  gymAvailabilityInput,
  gymExerciseSettingId,
  gymExerciseSettingInput,
  gymInput,
  EQUIPMENT,
  loadRangesSchema,
  unavailableEquipmentSchema,
  SYNC_LIMITS,
  type Equipment,
  type LoadRange,
} from "@workspace/shared";
import { and, asc, count, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { readPreferencesRow, userPreferences } from "../../preferences";
import { changedFields, nowIso, ownerOf, write, type TrainingDatabase } from "../store-common";
import { gym, gymEquipment, gymExerciseSetting, session } from "../tables";
import { unavailableEquipmentOf } from "./gym-watch";

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
 *
 * The server refuses an upload of more than `SYNC_LIMITS.maxOps` writes, and a kit can be larger,
 * so the copy goes in transactions of at most that many rows (the gym with the first of them).
 * A copy cut short, say by the app closing, leaves a gym with part of the kit, which the user can
 * complete in the kit screen; the gym itself is never half-made, because it uploads first.
 */
export async function createGym(
  database: TrainingDatabase,
  input: { name: string; copyKitFrom: string | null },
  scope: string,
): Promise<string> {
  const values = gymInput.parse({ name: input.name });
  const id = uuidv7();
  let rest: KitItem[] = [];
  await write(database, scope, async (tx) => {
    const userId = await ownerOf(tx);
    await tx.insert(gym).values({ id, user_id: userId, name: values.name, created_at: nowIso() });
    if (!input.copyKitFrom) return;
    // A gym that is gone has no kit to copy, whatever rows of it the device still holds.
    const [source] = await tx
      .select({ id: gym.id })
      .from(gym)
      .where(eq(gym.id, input.copyKitFrom))
      .limit(1);
    if (!source) return;
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
    const first = kit.slice(0, KIT_COPY_FIRST);
    rest = kit.slice(KIT_COPY_FIRST);
    await copyKit(tx, userId, id, first);
  });
  for (let at = 0; at < rest.length; at += KIT_COPY_CHUNK) {
    const chunk = rest.slice(at, at + KIT_COPY_CHUNK);
    await write(database, scope, async (tx) => copyKit(tx, await ownerOf(tx), id, chunk));
  }
  return id;
}

type KitItem = typeof gymEquipment.$inferSelect;
/** The gym row is one write of its first transaction, the rest of the room is kit. */
const KIT_COPY_FIRST = SYNC_LIMITS.maxOps - 1;
const KIT_COPY_CHUNK = SYNC_LIMITS.maxOps;

async function copyKit(tx: Tx, userId: string, gymId: string, items: readonly KitItem[]) {
  for (const item of items) {
    await tx.insert(gymEquipment).values({
      id: uuidv7(),
      user_id: userId,
      gym_id: gymId,
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

/** What a gym says about its equipment; a field left out stays as it is. */
export type GymAvailabilityPatch = {
  unavailableEquipment?: readonly Equipment[];
  dumbbellMaxKg?: number | null;
};

/** Sets the equipment a gym lacks and its dumbbell max. False when the gym is gone. */
export async function setGymAvailability(
  database: TrainingDatabase,
  id: string,
  patch: GymAvailabilityPatch,
  scope: string,
): Promise<boolean> {
  const fields = gymAvailabilityInput.partial().parse({
    unavailable_equipment: patch.unavailableEquipment && [...new Set(patch.unavailableEquipment)],
    dumbbell_max_kg: patch.dumbbellMaxKg,
  });
  return write(database, scope, async (tx) => {
    const [current] = await tx.select().from(gym).where(eq(gym.id, id)).limit(1);
    if (!current) return false;
    const changes: Partial<typeof gym.$inferInsert> = {};
    if (fields.unavailable_equipment !== undefined) {
      // A fixed order, so two devices that tick the same boxes store the same text.
      const text = JSON.stringify(
        EQUIPMENT.filter((equipment) => fields.unavailable_equipment?.includes(equipment)),
      );
      if (text !== JSON.stringify(unavailableEquipmentOf(current.unavailable_equipment)))
        changes.unavailable_equipment = text;
    }
    if (fields.dumbbell_max_kg !== undefined && fields.dumbbell_max_kg !== current.dumbbell_max_kg)
      changes.dumbbell_max_kg = fields.dumbbell_max_kg;
    if (Object.keys(changes).length > 0) await tx.update(gym).set(changes).where(eq(gym.id, id));
    return true;
  });
}

/**
 * Ticks one equipment type on or off against the gym's current row, so a toggle never carries
 * the other types along from a stale screen. False when the gym is gone.
 */
export async function setGymEquipmentHere(
  database: TrainingDatabase,
  id: string,
  equipment: Equipment,
  here: boolean,
  scope: string,
): Promise<boolean> {
  const checked = unavailableEquipmentSchema.parse([equipment]);
  return write(database, scope, async (tx) => {
    const [current] = await tx.select().from(gym).where(eq(gym.id, id)).limit(1);
    if (!current) return false;
    const lacking = unavailableEquipmentOf(current.unavailable_equipment);
    const next = EQUIPMENT.filter((entry) =>
      entry === checked[0] ? !here : lacking.includes(entry),
    );
    if (JSON.stringify(next) !== JSON.stringify(lacking))
      await tx
        .update(gym)
        .set({ unavailable_equipment: JSON.stringify(next) })
        .where(eq(gym.id, id));
    return true;
  });
}

/**
 * Deletes a gym. Only the gym row goes: its kit and exercise settings can number more than one
 * upload may hold (`SYNC_LIMITS.maxOps`), so the server takes them down with it (`deleteGymCascade`)
 * and nulls `gym_id` on its Sessions, which stay and read as "any gym". Until that sync arrives,
 * readers ignore the kit, settings and Sessions of a gym that is gone. The last gym cannot be
 * deleted: false.
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
 * when it was removed or the gym is gone.
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
    const [live] = await tx
      .select({ id: gym.id })
      .from(gym)
      .where(eq(gym.id, target.gymId))
      .limit(1);
    if (!live) return null;
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
      // One id per user, gym and exercise, so two devices that each create the setting offline
      // make the same row and a later edit from either reaches it.
      const id = gymExerciseSettingId({
        userId,
        gymId: target.gymId,
        exerciseId: target.exerciseId,
      });
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
