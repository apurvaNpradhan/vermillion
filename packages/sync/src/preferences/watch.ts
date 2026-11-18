import type { AbstractPowerSyncDatabase } from "@powersync/common";
import type { Preferences } from "@workspace/shared";
import { z } from "zod";

import { PREFERENCES_SQL, readPreferencesRow } from "./store";

const rowSchema = z.object({
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  ui: z.string(),
});

/**
 * Watches the owner's preferences on the device. Emits at once, from SQLite: the defaults while no
 * row exists yet, so a screen never waits for the network.
 */
export function watchPreferences(
  database: AbstractPowerSyncDatabase,
  owner: string,
  handlers: { onValue: (preferences: Preferences) => void; onError: () => void },
) {
  const controller = new AbortController();
  database.watchWithCallback(
    PREFERENCES_SQL,
    [owner],
    {
      onResult: (result) => {
        const rows = z.array(rowSchema).safeParse(result.array);
        if (rows.success) handlers.onValue(readPreferencesRow(rows.data[0]));
        else handlers.onError();
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["user_preferences"] },
  );
  return () => controller.abort();
}
