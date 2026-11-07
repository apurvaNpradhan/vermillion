import type { Database } from "@workspace/db";

import { purgePreferences } from "../preferences/index";

export type UserDataPurger = (db: Database, userId: string) => Promise<void>;

/**
 * Every vertical that stores rows for a user and cannot rely on a cascade
 * from the user table joins here. Purgers are idempotent: account deletion
 * calls them, and a cleanup job calls them again until they all succeed.
 */
const purgers: readonly UserDataPurger[] = [purgePreferences];

export async function purgeUserData(db: Database, userId: string) {
  for (const purge of purgers) await purge(db, userId);
}
