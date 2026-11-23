import { EXPERIENCE_WARMUP_STEPS } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { ensureInstallId } from "../platform/install-meta";
import { uploadColumns } from "../platform/upload-columns";
import {
  preferencesUploadColumns,
  readPreferences,
  readPreferencesRow,
  savePreferences,
  type PreferencesDatabase,
} from "./index";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  const installId = await ensureInstallId(fake.database);
  // Safety: the fake implements the database methods the store calls.
  const database = fake.database as never as PreferencesDatabase;
  const rows = () => fake.sqlite.prepare("SELECT * FROM user_preferences").all();
  const scope = { installId, owner: "owner" };
  const patchOf = () => JSON.parse(String((rows()[0] as { patch: string }).patch));
  return { ...fake, database, installId, scope, rows, patchOf };
}

describe("preferences store", () => {
  it("reads as the defaults while no row exists", () => {
    const preferences = readPreferencesRow(undefined);
    expect(preferences.ui.weightUnit).toBe("kg");
    expect(preferences.locale).toBeNull();
  });

  it("makes the Device owner's row on the first write and shows it at once", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.scope);
    const [row] = s.rows();
    expect(row).toMatchObject({ user_id: "owner", locale: null, timezone: null });
    expect(readPreferencesRow(row as never).ui.weightUnit).toBe("lb");
    expect(readPreferencesRow(row as never).ui.lengthUnit).toBe("in");
  });

  it("keeps the deprecated Timer view and inline timer values instead of dropping every preference", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.scope);
    // An older app wrote the Timer view; storing it must not make the whole row unreadable.
    s.sqlite
      .prepare("UPDATE user_preferences SET ui = ?")
      .run(JSON.stringify({ weightUnit: "lb", sessionView: "timer", inlineTimer: false }));
    const [row] = s.rows();
    expect(readPreferencesRow(row as never).ui.weightUnit).toBe("lb");
    await savePreferences(s.database, { ui: { keepAwake: false } }, s.scope);
    const [after] = s.rows();
    expect(JSON.parse(String((after as { ui: string }).ui))).toEqual({
      weightUnit: "lb",
      sessionView: "timer",
      inlineTimer: false,
      keepAwake: false,
    });
  });

  it("merges ui key by key and keeps what it does not know", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.scope);
    await savePreferences(
      s.database,
      { ui: { keepAwake: false }, timezone: "Europe/Berlin" },
      s.scope,
    );
    expect(s.rows()).toHaveLength(1);
    const [row] = s.rows();
    expect(JSON.parse(String((row as { ui: string }).ui))).toEqual({
      weightUnit: "lb",
      keepAwake: false,
    });
    expect(readPreferencesRow(row as never).timezone).toBe("Europe/Berlin");
  });

  it("preserves future training answers through an unrelated local write", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.scope);
    s.sqlite
      .prepare("UPDATE user_preferences SET ui = ?")
      .run('{"weightUnit":"lb","trainingPlace":"future_place","futureKey":true}');
    await savePreferences(s.database, { ui: { keepAwake: false } }, s.scope);
    expect(JSON.parse(String((s.rows()[0] as { ui: string }).ui))).toMatchObject({
      trainingPlace: "future_place",
      futureKey: true,
    });
    expect((await readPreferences(s.database, "owner")).ui).toMatchObject({
      weightUnit: "lb",
      trainingPlace: null,
      keepAwake: false,
    });
  });

  it("derives the local warm-up default without uploading the ramp", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { trainingExperience: "new" } }, s.scope);
    expect((await readPreferences(s.database, "owner")).ui.warmupSteps).toEqual(
      EXPERIENCE_WARMUP_STEPS.new,
    );
    expect(s.patchOf().ui).toEqual({ trainingExperience: "new" });
    const custom = [{ percent: 40, reps: 8 }];
    await savePreferences(s.database, { ui: { warmupSteps: custom } }, s.scope);
    await savePreferences(s.database, { ui: { trainingExperience: "experienced" } }, s.scope);
    expect((await readPreferences(s.database, "owner")).ui).toMatchObject({
      trainingExperience: "experienced",
      warmupSteps: custom,
    });
  });

  it("refuses a value the server would refuse, and a write from a changed account", async () => {
    const s = await setup();
    await expect(
      savePreferences(s.database, { ui: { defaultRestSeconds: -5 } }, s.scope),
    ).rejects.toThrow();
    await expect(
      savePreferences(s.database, { ui: { keepAwake: false } }, { ...s.scope, installId: "other" }),
    ).rejects.toThrow();
    expect(s.rows()).toEqual([]);
  });

  it("refuses a write for a user other than the Device owner, and reads only the owner's row", async () => {
    const s = await setup();
    await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.scope);
    await expect(
      savePreferences(s.database, { ui: { weightUnit: "kg" } }, { ...s.scope, owner: "intruder" }),
    ).rejects.toThrow("another account");
    expect(JSON.parse(String((s.rows()[0] as { ui: string }).ui))).toEqual({ weightUnit: "lb" });
    expect((await readPreferences(s.database, "owner")).ui.weightUnit).toBe("lb");
    // Another account's screen sees the defaults, never the owner's units.
    expect((await readPreferences(s.database, "intruder")).ui.weightUnit).toBe("kg");
  });

  it("refuses a captured save once the account is no longer authorized", async () => {
    const s = await setup();
    let authorized = true;
    const save = () =>
      savePreferences(
        s.database,
        { ui: { weightUnit: "lb" } },
        { ...s.scope, isAuthorized: () => authorized },
      );
    authorized = false;
    await expect(save()).rejects.toThrow("another account");
    expect(s.rows()).toEqual([]);
    authorized = true;
    await save();
    expect(s.rows()).toHaveLength(1);
  });

  describe("upload patch", () => {
    it("queues only the keys of the latest write, not the merged view", async () => {
      const s = await setup();
      await savePreferences(s.database, { ui: { weightUnit: "lb", avatarMediaId: null } }, s.scope);
      await savePreferences(s.database, { ui: { keepAwake: false } }, s.scope);
      const { writtenAt, ...patch } = s.patchOf();
      expect(patch).toEqual({ ui: { keepAwake: false } });
      expect(writtenAt).toEqual(expect.any(String));
      // The merged local view still has everything.
      expect(JSON.parse(String((s.rows()[0] as { ui: string }).ui))).toEqual({
        weightUnit: "lb",
        avatarMediaId: null,
        keepAwake: false,
      });
    });

    it("never re-sends an avatar this write did not change", async () => {
      const s = await setup();
      const avatar = "0190a5d0-0000-7000-8000-000000000001";
      await savePreferences(s.database, { ui: { avatarMediaId: avatar } }, s.scope);
      await savePreferences(s.database, { ui: { weightUnit: "lb" } }, s.scope);
      expect(s.patchOf().ui).toEqual({ weightUnit: "lb" });
    });

    it("keeps an explicit null on the first insert, where the column itself would be NULL", async () => {
      const s = await setup();
      await savePreferences(s.database, { timezone: null }, s.scope);
      expect(s.patchOf()).toMatchObject({ timezone: null });
      expect("locale" in s.patchOf()).toBe(false);
      expect((s.rows()[0] as { timezone: string | null }).timezone).toBeNull();
    });

    it("queues a per-muscle goal edit alone and applies it to the local map", async () => {
      const s = await setup();
      const grow = { level: "grow" } as const;
      await savePreferences(s.database, { ui: { muscleGoals: { quadriceps: grow } } }, s.scope);
      await savePreferences(
        s.database,
        { muscleGoalChanges: { chest: { level: "custom", min: 12, max: 18 } } },
        s.scope,
      );
      const { writtenAt: _at, ...patch } = s.patchOf();
      expect(patch).toEqual({
        muscleGoalChanges: { chest: { level: "custom", min: 12, max: 18 } },
      });
      const read = () => readPreferencesRow(s.rows()[0] as never).ui.muscleGoals;
      expect(read()).toEqual({ quadriceps: grow, chest: { level: "custom", min: 12, max: 18 } });
      await savePreferences(s.database, { muscleGoalChanges: { quadriceps: null } }, s.scope);
      expect(s.patchOf().muscleGoalChanges).toEqual({ quadriceps: null });
      expect(read()).toEqual({ chest: { level: "custom", min: 12, max: 18 } });
    });

    it("uploads the patch column and nothing else", () => {
      expect([...preferencesUploadColumns]).toEqual(["patch"]);
      expect([...(uploadColumns.get("user_preferences") ?? [])]).toEqual(["patch"]);
    });
  });
});
