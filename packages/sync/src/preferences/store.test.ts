import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { ensureInstallId } from "../platform/install-meta";
import { readPreferencesRow, savePreferences, type PreferencesDatabase } from "./index";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  const installId = await ensureInstallId(fake.database);
  // Safety: the fake implements the database methods the store calls.
  const database = fake.database as never as PreferencesDatabase;
  const rows = () => fake.sqlite.prepare("SELECT * FROM user_preferences").all();
  return { ...fake, database, installId, rows };
}

describe("preferences store", () => {
  it("reads as the defaults while no row exists", () => {
    const preferences = readPreferencesRow(undefined);
    expect(preferences.ui.weightUnit).toBe("kg");
    expect(preferences.locale).toBeNull();
  });

  it("makes the Device owner's row on the first write and shows it at once", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.installId);
    const [row] = s.rows();
    expect(row).toMatchObject({ user_id: "owner", locale: null, timezone: null });
    expect(readPreferencesRow(row as never).ui.weightUnit).toBe("lb");
    expect(readPreferencesRow(row as never).ui.lengthUnit).toBe("in");
  });

  it("merges ui key by key and keeps what it does not know", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.installId);
    await savePreferences(
      s.database,
      { ui: { keepAwake: false }, timezone: "Europe/Berlin" },
      s.installId,
    );
    expect(s.rows()).toHaveLength(1);
    const [row] = s.rows();
    expect(JSON.parse(String((row as { ui: string }).ui))).toEqual({
      weightUnit: "lb",
      keepAwake: false,
    });
    expect(readPreferencesRow(row as never).timezone).toBe("Europe/Berlin");
  });

  it("refuses a value the server would refuse, and a write from a changed account", async () => {
    const s = await setup();
    await expect(
      savePreferences(s.database, { ui: { defaultRestSeconds: -5 } }, s.installId),
    ).rejects.toThrow();
    await expect(
      savePreferences(s.database, { ui: { keepAwake: false } }, "someone-else"),
    ).rejects.toThrow();
    expect(s.rows()).toEqual([]);
  });
});
