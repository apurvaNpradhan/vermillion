import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import {
  isLocale,
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

/** Columns of `user_preferences` the server accepts in an upload; the rest are local only. */
export const preferencesUploadColumns: ReadonlySet<string> = new Set(["locale", "timezone", "ui"]);

/** The newest row wins: a row made offline before the first sync outranks the server's older one. */
export const PREFERENCES_SQL = "SELECT * FROM user_preferences ORDER BY id DESC LIMIT 1";

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

/**
 * Saves any subset of the preferences on the device and queues the upload. The row is made on the
 * first write; `ui` merges key by key. Runs in the write transaction after the write-scope check
 * (ADR 0021), so a write cannot land in another account's database.
 */
export async function savePreferences(
  database: PreferencesDatabase,
  input: UpdatePreferences,
  expectedInstallId: string | undefined,
) {
  const patch = updatePreferencesSchema.parse(input);
  return wrapPowerSyncWithDrizzle(database, { schema: drizzleSchema }).transaction(async (tx) => {
    if (expectedInstallId !== undefined) {
      const [install] = await tx
        .select({ id: installMeta.id })
        .from(installMeta)
        .where(eq(installMeta.install_id, expectedInstallId))
        .limit(1);
      if (!install) throw new Error("The device account changed; reopen the screen");
    }
    const [owner] = await tx
      .select({ user_id: deviceOwner.user_id })
      .from(deviceOwner)
      .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
      .limit(1);
    if (!owner) throw new Error("Device owner changed");
    const [row] = await tx
      .select()
      .from(userPreferences)
      .orderBy(desc(userPreferences.id))
      .limit(1);
    const ui = JSON.stringify({ ...sparseUi(row?.ui), ...patch.ui });
    const values = {
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.ui ? { ui } : {}),
    };
    if (row) {
      if (Object.keys(values).length > 0)
        await tx.update(userPreferences).set(values).where(eq(userPreferences.id, row.id));
      return;
    }
    await tx.insert(userPreferences).values({
      id: uuidv7(),
      user_id: owner.user_id,
      locale: null,
      timezone: null,
      ui,
      ...values,
      created_at: new Date().toISOString(),
    });
  });
}
