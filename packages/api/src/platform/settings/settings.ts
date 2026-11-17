import type { DbExecutor } from "@workspace/db";
import { semverSchema } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { appSetting } from "./tables";

/** Every setting key with the schema of its value. A new key is a line here, no migration. */
const SETTING_SCHEMAS = {
  /** Builds below this version see a blocking "update required" screen. */
  minimum_app_version: semverSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<Key extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[Key]>;

/** The stored value, or null when it was never set. A stored value that no longer parses is null. */
export async function readSetting<Key extends SettingKey>(
  db: DbExecutor,
  key: Key,
): Promise<SettingValue<Key> | null> {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, key))
    .limit(1);
  if (!row) return null;
  const parsed = SETTING_SCHEMAS[key].safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

/** Validates and stores a value; `updatedBy` is the admin who changed it. */
export async function writeSetting<Key extends SettingKey>(
  db: DbExecutor,
  key: Key,
  value: SettingValue<Key>,
  updatedBy: string,
): Promise<void> {
  const parsed = SETTING_SCHEMAS[key].parse(value);
  const now = new Date();
  await db
    .insert(appSetting)
    .values({ key, value: parsed, updatedAt: now, updatedBy })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value: parsed, updatedAt: now, updatedBy },
    });
}
