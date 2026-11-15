import { purgeUserMedia } from "../media/index";
import { purgePreferences } from "../preferences/index";
import type { Services } from "./services";

export type UserDataPurger = (
  services: Pick<Services, "db" | "objectStore">,
  userId: string,
) => Promise<void>;

/**
 * Every vertical that stores data for a user and cannot rely on a cascade
 * from the user table joins here (rows without a cascade, and objects outside Postgres such as
 * the user's media). Purgers are idempotent: account deletion calls them, and a cleanup job calls
 * them again until they all succeed.
 */
const purgers: readonly UserDataPurger[] = [
  ({ db }, userId) => purgePreferences(db, userId),
  purgeUserMedia,
];

export async function purgeUserData(
  services: Pick<Services, "db" | "objectStore">,
  userId: string,
) {
  for (const purge of purgers) await purge(services, userId);
}
