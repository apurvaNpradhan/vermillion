import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import {
  isLocale,
  TARGET_MUSCLES,
  type MuscleGoals,
  preferencesSchema,
  uiPreferencesPatchSchema,
  updatePreferencesSchema,
  type Preferences,
  type UpdatePreferences,
} from "@workspace/shared";
import { desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { DEVICE_OWNER_ID } from "../platform/device-owner";
import { drizzleSchema } from "../platform/schema";
import { deviceOwner, installMeta } from "../platform/tables";
import { userPreferences } from "./tables";

export type PreferencesDatabase = AbstractPowerSyncDatabase;

/**
 * Columns of `user_preferences` an upload carries: the dirty-key `patch` only. The merged
 * `locale`, `timezone` and `ui` are the local view, and sending them would let a stale value
 * overwrite another device's newer edit.
 */
export const preferencesUploadColumns: ReadonlySet<string> = new Set(["patch"]);

/** What builds before the `patch` column uploaded; a queued entry without `patch` keeps it. */
export const legacyPreferencesUploadColumns: ReadonlySet<string> = new Set([
  "locale",
  "timezone",
  "ui",
]);

/**
 * The owner's newest row wins: a row made offline before the first sync outranks the server's
 * older one. Another user's row is never read (ADR 0021).
 */
export const PREFERENCES_SQL =
  "SELECT locale, timezone, ui FROM user_preferences WHERE user_id = ? ORDER BY id DESC LIMIT 1";

/** What the user changed, as stored; keys this build does not know (a newer app's) are kept. */
const storedUiSchema = uiPreferencesPatchSchema.loose();

function sparseUi(text: string | undefined) {
  try {
    const parsed = storedUiSchema.safeParse(JSON.parse(text ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Reads the preferences out of a local row; a missing or unreadable row reads as the defaults. */
export function readPreferencesRow(
  row: { locale: string | null; timezone: string | null; ui: string } | undefined,
): Preferences {
  const saved = preferencesSchema.safeParse({
    locale: row && isLocale(row.locale) ? row.locale : null,
    timezone: row?.timezone ?? null,
    ui: sparseUi(row?.ui),
  });
  return saved.success
    ? saved.data
    : preferencesSchema.parse({ locale: null, timezone: null, ui: {} });
}

type PreferenceRow = { locale: string | null; timezone: string | null; ui: string };

/** Reads the owner's preferences on the device (the defaults while no row exists). */
export async function readPreferences(
  database: PreferencesDatabase,
  owner: string,
): Promise<Preferences> {
  const row = await database.getOptional<PreferenceRow>(PREFERENCES_SQL, [owner]);
  return readPreferencesRow(row ?? undefined);
}

/** Who a write is for: the install id the screen captured and the user it believes owns the data. */
export type PreferencesScope = {
  installId: string | undefined;
  owner: string | undefined;
  /** Asked inside the write transaction: false when the account was locked or switched since. */
  isAuthorized?: () => boolean;
};

/**
 * Saves any subset of the preferences on the device and queues the upload. The row is made on the
 * first write; `ui` merges key by key into the local view, while the upload carries only this
 * write's keys (`patch`, with `null` kept as `null`). Runs in the write transaction after the
 * scope check (ADR 0021): a write cannot land in another account's database, nor under another
 * user than the one the screen belongs to.
 */
export async function savePreferences(
  database: PreferencesDatabase,
  input: UpdatePreferences,
  scope: PreferencesScope,
) {
  const patch = updatePreferencesSchema.parse(input);
  return wrapPowerSyncWithDrizzle(database, { schema: drizzleSchema }).transaction(async (tx) => {
    if (scope.installId !== undefined) {
      const [install] = await tx
        .select({ id: installMeta.id })
        .from(installMeta)
        .where(eq(installMeta.install_id, scope.installId))
        .limit(1);
      if (!install) throw new Error("The device account changed; reopen the screen");
    }
    const [owner] = await tx
      .select({ user_id: deviceOwner.user_id })
      .from(deviceOwner)
      .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
      .limit(1);
    if (!owner) throw new Error("Device owner changed");
    if (scope.isAuthorized && !scope.isAuthorized())
      throw new Error("The device belongs to another account");
    if (scope.owner !== undefined && scope.owner !== owner.user_id)
      throw new Error("The device belongs to another account");
    const [row] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.user_id, owner.user_id))
      .orderBy(desc(userPreferences.id))
      .limit(1);
    const merged = { ...sparseUi(row?.ui), ...patch.ui };
    const changes = patch.muscleGoalChanges;
    if (changes) {
      // The local view of the per-muscle edits; the upload carries only the edits themselves.
      const goals: MuscleGoals = { ...merged.muscleGoals };
      for (const muscle of TARGET_MUSCLES) {
        const goal = changes[muscle];
        if (goal === undefined) continue;
        if (goal === null) delete goals[muscle];
        else goals[muscle] = goal;
      }
      merged.muscleGoals = goals;
    }
    const ui = JSON.stringify(merged);
    const values = {
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.ui || patch.muscleGoalChanges ? { ui } : {}),
    };
    // Only what this write changed goes up; `writtenAt` keeps two equal writes from collapsing.
    const dirty = JSON.stringify({ ...patch, writtenAt: new Date().toISOString() });
    if (row) {
      if (Object.keys(values).length > 0)
        await tx
          .update(userPreferences)
          .set({ ...values, patch: dirty })
          .where(eq(userPreferences.id, row.id));
      return;
    }
    await tx.insert(userPreferences).values({
      id: uuidv7(),
      user_id: owner.user_id,
      locale: null,
      timezone: null,
      ui,
      ...values,
      patch: dirty,
      created_at: new Date().toISOString(),
    });
  });
}
