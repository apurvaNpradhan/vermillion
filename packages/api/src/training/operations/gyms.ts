import type { DbExecutor } from "@workspace/db";
import { and, asc, eq, isNull } from "drizzle-orm";

import { gym, gymEquipment, gymExerciseSetting, session } from "../tables";
import { findGym, lockUserTraining } from "./lookup";

/** The name of the gym every account starts with. */
export const DEFAULT_GYM_NAME = "My gym";

/** The oldest live gym of the user: the one a row written before gyms existed belongs to. */
export async function defaultGymId(db: DbExecutor, userId: string) {
  const [row] = await db
    .select({ id: gym.id })
    .from(gym)
    .where(and(eq(gym.userId, userId), isNull(gym.deletedAt)))
    .orderBy(asc(gym.createdAt), asc(gym.id))
    .limit(1);
  return row?.id;
}

/**
 * Makes sure the user has a gym, creating "My gym" when there is none, and returns the default
 * one. Runs under the user's training lock so two requests cannot both create it. The server does
 * this when a device first asks for sync credentials, so no client ever invents the default gym
 * and two offline devices cannot end up with two.
 */
export async function ensureDefaultGym(db: DbExecutor, userId: string): Promise<string> {
  await lockUserTraining(db, userId);
  const existing = await defaultGymId(db, userId);
  if (existing) return existing;
  const [created] = await db
    .insert(gym)
    .values({ userId, name: DEFAULT_GYM_NAME })
    .returning({ id: gym.id });
  if (!created) throw new Error("Could not create the default gym");
  return created.id;
}

/**
 * The gym a Session may name: the writer's own live gym. A gym that was deleted (a Session
 * written offline against it) or never reached the server reads as no gym, so the Session is
 * kept; another user's gym is refused by returning `refuse`.
 */
export async function resolveSessionGym(
  db: DbExecutor,
  userId: string,
  gymId: string | null,
): Promise<{ gymId: string | null } | "refuse"> {
  if (gymId === null) return { gymId: null };
  const found = await findGym(db, userId, gymId);
  if (found.kind === "other-user") return "refuse";
  return { gymId: found.kind === "own" && found.row.deletedAt === null ? gymId : null };
}

/**
 * Soft-deletes a gym with its kit and exercise settings, and nulls `gym_id` on its Sessions (they
 * stay, as "any gym"). One timestamp for everything it takes down.
 */
export async function deleteGymCascade(db: DbExecutor, userId: string, id: string, now: Date) {
  const mark = { deletedAt: now, updatedAt: now };
  await db
    .update(gym)
    .set(mark)
    .where(and(eq(gym.id, id), eq(gym.userId, userId), isNull(gym.deletedAt)));
  await db
    .update(gymEquipment)
    .set(mark)
    .where(
      and(
        eq(gymEquipment.gymId, id),
        eq(gymEquipment.userId, userId),
        isNull(gymEquipment.deletedAt),
      ),
    );
  await db
    .update(gymExerciseSetting)
    .set(mark)
    .where(
      and(
        eq(gymExerciseSetting.gymId, id),
        eq(gymExerciseSetting.userId, userId),
        isNull(gymExerciseSetting.deletedAt),
      ),
    );
  await db
    .update(session)
    .set({ gymId: null, updatedAt: now })
    .where(and(eq(session.gymId, id), eq(session.userId, userId)));
}
