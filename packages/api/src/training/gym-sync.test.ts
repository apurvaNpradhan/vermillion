import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  gymExerciseSettingId,
  GYM_LIMITS,
  SYNC_SCHEMA_VERSION,
  type SyncFailureCode,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bundledCatalogText } from "../exercise/operations/bundled-catalog";
import { seedCatalog } from "../exercise/operations/seed-catalog";
import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

const syncOptions = {
  config: {
    sync: {
      endpoint: "http://127.0.0.1:8090",
      slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
    },
  },
};

type Value = string | number | null;
const applied: SyncUploadResult = { status: "applied" };
const rejected = (code: SyncFailureCode): Partial<SyncUploadResult> => ({
  status: "rejected",
  code,
});
const op = (kind: SyncOp["op"], table: string, id: string, opData?: SyncOp["opData"]): SyncOp =>
  opData ? { op: kind, table, id, opData } : { op: kind, table, id };
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const ranges = (
  value: { min: number; max: number | null; step: number | null; extra?: boolean }[],
) => JSON.stringify(value);

describe("gym upload handlers", () => {
  let app: TestApp;
  let exerciseId: string;
  const device = uuidv7();
  beforeAll(async () => {
    app = await createTestApp(syncOptions);
    await seedCatalog(app.services.db, bundledCatalogText());
    const [row] = await app.rows(
      sql`SELECT id FROM exercise WHERE user_id IS NULL AND exercise_type = 'weight_reps' LIMIT 1`,
    );
    exerciseId = String(row?.id);
  });
  afterAll(async () => app.close());

  async function writer(email: string) {
    const client = app.client(await createSignedInUser(app, email));
    const { userId } = await client.sync.credentials();
    const installId = uuidv7();
    let txId = 0;
    return {
      userId,
      client,
      send: (ops: SyncOp[]): Promise<SyncUploadResult> => {
        txId += 1;
        return client.sync.upload({
          userId,
          installId,
          txId,
          schemaVersion: SYNC_SCHEMA_VERSION,
          digest: computeOpsDigest(ops),
          ops,
        });
      },
    };
  }
  type Writer = Awaited<ReturnType<typeof writer>>;

  const stored = async (table: string, id: string) => {
    const [row] = await app.rows(
      table === "gym_exercise_setting"
        ? sql`SELECT id, user_id, gym_id, exercise_id, load_ranges::text AS load_ranges, setup_note, deleted_at FROM gym_exercise_setting WHERE id = ${id}`
        : table === "gym"
          ? sql`SELECT id, user_id, name, unavailable_equipment::text AS unavailable_equipment, dumbbell_max_kg, deleted_at FROM gym WHERE id = ${id}`
          : sql`SELECT * FROM ${sql.identifier(table)} WHERE id = ${id}`,
    );
    return row;
  };
  const liveGyms = async (userId: string) =>
    app.rows(
      sql`SELECT id, name FROM gym WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY created_at, id`,
    );
  const putGym = (id: string, name: string, extra: Record<string, Value> = {}) =>
    op("PUT", "gym", id, { name, ...extra });
  const putEquipment = (id: string, extra: Record<string, Value> = {}) =>
    op("PUT", "gym_equipment", id, {
      kind: "plate",
      weight_kg: 5,
      unit: "kg",
      label: null,
      count: null,
      enabled: 1,
      ...extra,
    });
  const putSession = (id: string, extra: Record<string, Value> = {}) =>
    op("PUT", "training_session", id, {
      workout_id: null,
      program_id: null,
      run_id: null,
      slot_id: null,
      cycle: null,
      title: "Push",
      title_derived: 0,
      note: null,
      started_at: minutesAgo(30),
      finished_at: null,
      duration_s: null,
      device_id: device,
      rest_set_id: null,
      rest_started_at: null,
      rest_ends_at: null,
      ...extra,
    });
  const putSetting = (id: string, gymId: string, extra: Record<string, Value> = {}) =>
    op("PUT", "gym_exercise_setting", id, {
      gym_id: gymId,
      exercise_id: exerciseId,
      load_ranges: ranges([{ min: 5, max: 91, step: 1 }]),
      setup_note: "Seat 4",
      ...extra,
    });

  /** The one id a setting of this user, gym and exercise has. */
  const settingId = (me: Writer, gymId: string, forExercise = exerciseId) =>
    gymExerciseSettingId({ userId: me.userId, gymId, exerciseId: forExercise });

  async function defaultGym(me: Writer) {
    const [gym] = await liveGyms(me.userId);
    return String(gym?.id);
  }

  it('creates "My gym" when an account first asks for credentials, once', async () => {
    const me = await writer("gym-default@example.com");
    expect(await liveGyms(me.userId)).toMatchObject([{ name: "My gym" }]);
    await me.client.sync.credentials();
    expect(await liveGyms(me.userId)).toHaveLength(1);
  });

  it("puts, renames and deletes gyms, and keeps the last one", async () => {
    const me = await writer("gym-crud@example.com");
    const first = await defaultGym(me);
    const second = uuidv7();
    expect(await me.send([putGym(second, "Garage")])).toEqual(applied);
    expect(await stored("gym", second)).toMatchObject({ user_id: me.userId, name: "Garage" });
    expect(await me.send([op("PATCH", "gym", second, { name: "Home" })])).toEqual(applied);
    expect(await stored("gym", second)).toMatchObject({ name: "Home" });
    expect(await me.send([op("DELETE", "gym", second)])).toEqual(applied);
    expect((await stored("gym", second))?.deleted_at).not.toBeNull();
    // Deleting twice is a no-op; the last gym cannot be deleted.
    expect(await me.send([op("DELETE", "gym", second)])).toEqual(applied);
    expect(await me.send([op("DELETE", "gym", first)])).toMatchObject(
      rejected("SYNC_CONSTRAINT_VIOLATION"),
    );
    expect(await liveGyms(me.userId)).toHaveLength(1);
  });

  it("refuses bad names, foreign ids, a deleted gym's plain PUT", async () => {
    const me = await writer("gym-rules@example.com");
    const other = await writer("gym-rules-other@example.com");
    expect(await me.send([putGym(uuidv7(), "")])).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await me.send([putGym(uuidv7(), "x".repeat(GYM_LIMITS.nameMax + 1))])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(await me.send([putGym(uuidv7(), "Gym", { extra: 1 })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    const theirs = await defaultGym(other);
    expect(await me.send([putGym(theirs, "Mine now")])).toMatchObject(rejected("SYNC_ID_CONFLICT"));
    expect(await me.send([op("PATCH", "gym", theirs, { name: "X" })])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    expect(await me.send([op("DELETE", "gym", theirs)])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    const gone = uuidv7();
    expect(await me.send([putGym(gone, "Gone")])).toEqual(applied);
    expect(await me.send([op("DELETE", "gym", gone)])).toEqual(applied);
    expect(await me.send([putGym(gone, "Back")])).toMatchObject(rejected("SYNC_ROW_DELETED"));
    expect(await me.send([putGym(gone, "Back", { restore: 1 })])).toEqual(applied);
  });

  it("stores the equipment a gym lacks and its dumbbell max, and defaults to all of it", async () => {
    const me = await writer("gym-equipment@example.com");
    const first = await defaultGym(me);
    expect(await stored("gym", first)).toMatchObject({ dumbbell_max_kg: null });
    expect((await stored("gym", first))?.unavailable_equipment).toBe("[]");

    const garage = uuidv7();
    expect(
      await me.send([
        putGym(garage, "Garage", {
          unavailable_equipment: JSON.stringify(["cable", "machine"]),
          dumbbell_max_kg: 32.5,
        }),
      ]),
    ).toEqual(applied);
    expect(await stored("gym", garage)).toMatchObject({
      unavailable_equipment: '["cable", "machine"]',
      dumbbell_max_kg: 32.5,
    });

    // A PATCH carries only what changed; clearing the max is a null.
    expect(
      await me.send([op("PATCH", "gym", garage, { unavailable_equipment: JSON.stringify([]) })]),
    ).toEqual(applied);
    expect(await stored("gym", garage)).toMatchObject({
      unavailable_equipment: "[]",
      dumbbell_max_kg: 32.5,
    });
    expect(await me.send([op("PATCH", "gym", garage, { dumbbell_max_kg: null })])).toEqual(applied);
    expect(await stored("gym", garage)).toMatchObject({ dumbbell_max_kg: null });
    expect(await me.send([op("PATCH", "gym", garage, { name: "Home" })])).toEqual(applied);
    expect(await stored("gym", garage)).toMatchObject({ name: "Home" });
  });

  it.each([
    { name: "an unknown type", data: { unavailable_equipment: JSON.stringify(["sled"]) } },
    { name: "bodyweight", data: { unavailable_equipment: JSON.stringify(["none"]) } },
    {
      name: "a repeated type",
      data: { unavailable_equipment: JSON.stringify(["cable", "cable"]) },
    },
    { name: "a list that is not JSON", data: { unavailable_equipment: "cable" } },
    { name: "an object", data: { unavailable_equipment: JSON.stringify({ cable: true }) } },
    { name: "a zero dumbbell max", data: { dumbbell_max_kg: 0 } },
    { name: "a negative dumbbell max", data: { dumbbell_max_kg: -5 } },
    { name: "a dumbbell max over the limit", data: { dumbbell_max_kg: 5000 } },
    { name: "a text dumbbell max", data: { dumbbell_max_kg: "heavy" } },
  ])("refuses a gym with $name, on PUT and PATCH", async ({ data }) => {
    const me = await writer(`gym-equipment-bad-${Math.random().toString(36).slice(2)}@example.com`);
    const first = await defaultGym(me);
    expect(await me.send([putGym(uuidv7(), "Bad", data)])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(await me.send([op("PATCH", "gym", first, data)])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
  });

  it("creates gyms beyond the old account limit", async () => {
    const me = await writer("gym-count@example.com");
    const batch = Array.from({ length: 24 }, (_, i) => putGym(uuidv7(), `Gym ${i + 2}`));
    expect(await me.send(batch)).toEqual(applied);
    expect(await liveGyms(me.userId)).toHaveLength(25);
  });

  it("puts a kit item in the default gym when it names none, and in the named gym", async () => {
    const me = await writer("gym-kit@example.com");
    const first = await defaultGym(me);
    const garage = uuidv7();
    const plain = uuidv7();
    const named = uuidv7();
    expect(
      await me.send([
        putGym(garage, "Garage"),
        putEquipment(plain),
        putEquipment(named, { gym_id: garage }),
      ]),
    ).toEqual(applied);
    expect(await stored("gym_equipment", plain)).toMatchObject({ gym_id: first });
    expect(await stored("gym_equipment", named)).toMatchObject({ gym_id: garage });
    // A kind the check now allows is not a kind the upload accepts yet.
    expect(await me.send([putEquipment(uuidv7(), { kind: "stack" })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
  });

  it("refuses kit in another user's or a deleted gym", async () => {
    const me = await writer("gym-kit-owner@example.com");
    const other = await writer("gym-kit-other@example.com");
    const theirs = await defaultGym(other);
    expect(await me.send([putEquipment(uuidv7(), { gym_id: theirs })])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    const gone = uuidv7();
    expect(await me.send([putGym(gone, "Gone"), op("DELETE", "gym", gone)])).toEqual(applied);
    expect(await me.send([putEquipment(uuidv7(), { gym_id: gone })])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
  });

  it("stores exercise settings per gym, each under its own deterministic id", async () => {
    const me = await writer("gym-setting@example.com");
    const first = await defaultGym(me);
    const garage = uuidv7();
    const a = settingId(me, first);
    const c = settingId(me, garage);
    expect(a).not.toBe(c);
    expect(await me.send([putGym(garage, "Garage"), putSetting(a, first)])).toEqual(applied);
    expect(await stored("gym_exercise_setting", a)).toMatchObject({
      gym_id: first,
      exercise_id: exerciseId,
      setup_note: "Seat 4",
    });
    expect(JSON.parse(String((await stored("gym_exercise_setting", a))?.load_ranges))).toEqual([
      { min: 5, max: 91, step: 1 },
    ]);
    // Another gym is another row.
    expect(await me.send([putSetting(c, garage, { setup_note: "Seat 2" })])).toEqual(applied);
    expect(await stored("gym_exercise_setting", c)).toMatchObject({ gym_id: garage });
    // PATCH changes only what is sent.
    expect(await me.send([op("PATCH", "gym_exercise_setting", a, { setup_note: null })])).toEqual(
      applied,
    );
    expect(await stored("gym_exercise_setting", a)).toMatchObject({ setup_note: null });
    expect(JSON.parse(String((await stored("gym_exercise_setting", a))?.load_ranges))).toEqual([
      { min: 5, max: 91, step: 1 },
    ]);
    expect(
      await me.send([
        op("PATCH", "gym_exercise_setting", a, {
          load_ranges: ranges([{ min: 1, max: null, step: 1 }]),
        }),
      ]),
    ).toEqual(applied);
    expect(JSON.parse(String((await stored("gym_exercise_setting", a))?.load_ranges))).toEqual([
      { min: 1, max: null, step: 1 },
    ]);
    expect(await me.send([op("DELETE", "gym_exercise_setting", a)])).toEqual(applied);
    expect((await stored("gym_exercise_setting", a))?.deleted_at).not.toBeNull();
  });

  it("converges two devices that each create a setting offline, and either can edit it after", async () => {
    const me = await writer("gym-setting-two@example.com");
    const first = await defaultGym(me);
    const id = settingId(me, first);
    const tablet = {
      send: (ops: SyncOp[]) => me.send(ops),
    };
    // Each device made its own row, with different fields; the same id arrives twice.
    expect(
      await me.send([
        putSetting(id, first, {
          load_ranges: ranges([{ min: 5, max: 90, step: 5 }]),
          setup_note: null,
        }),
      ]),
    ).toEqual(applied);
    expect(
      await tablet.send([putSetting(id, first, { load_ranges: ranges([]), setup_note: "Seat 4" })]),
    ).toEqual(applied);
    expect(await stored("gym_exercise_setting", id)).toMatchObject({ setup_note: "Seat 4" });
    expect(JSON.parse(String((await stored("gym_exercise_setting", id))?.load_ranges))).toEqual([
      { min: 5, max: 90, step: 5 },
    ]);
    const live = await app.rows(
      sql`SELECT id FROM gym_exercise_setting WHERE gym_id = ${first} AND exercise_id = ${exerciseId} AND deleted_at IS NULL`,
    );
    expect(live).toHaveLength(1);
    // A later edit from either device finds the row.
    expect(
      await me.send([op("PATCH", "gym_exercise_setting", id, { setup_note: "Seat 5" })]),
    ).toEqual(applied);
    expect(
      await tablet.send([op("PATCH", "gym_exercise_setting", id, { setup_note: null })]),
    ).toEqual(applied);
    expect(await stored("gym_exercise_setting", id)).toMatchObject({ setup_note: null });
  });

  it("brings a deleted setting back under its id, with only what the new PUT holds", async () => {
    const me = await writer("gym-setting-revive@example.com");
    const first = await defaultGym(me);
    const id = settingId(me, first);
    expect(await me.send([putSetting(id, first)])).toEqual(applied);
    expect(await me.send([op("DELETE", "gym_exercise_setting", id)])).toEqual(applied);
    expect(
      await me.send([op("PATCH", "gym_exercise_setting", id, { setup_note: "x" })]),
    ).toMatchObject(rejected("SYNC_ROW_DELETED"));
    expect(
      await me.send([putSetting(id, first, { load_ranges: ranges([]), setup_note: "Pin 3" })]),
    ).toEqual(applied);
    expect(await stored("gym_exercise_setting", id)).toMatchObject({
      setup_note: "Pin 3",
      deleted_at: null,
    });
    expect(JSON.parse(String((await stored("gym_exercise_setting", id))?.load_ranges))).toEqual([]);
  });

  it("rejects a non-derived id even when the exercise already has a setting", async () => {
    const me = await writer("gym-setting-id@example.com");
    const first = await defaultGym(me);
    const id = settingId(me, first);
    const wrong = uuidv7();
    expect(await me.send([putSetting(wrong, first)])).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await me.send([putSetting(id, first)])).toEqual(applied);
    expect(await me.send([putSetting(wrong, first, { setup_note: "Wrong" })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(await stored("gym_exercise_setting", wrong)).toBeUndefined();
    expect(await stored("gym_exercise_setting", id)).toMatchObject({ setup_note: "Seat 4" });
  });

  it("refuses PUT on another user's setting id", async () => {
    const me = await writer("gym-setting-put-owner@example.com");
    const other = await writer("gym-setting-put-other@example.com");
    const first = await defaultGym(me);
    const id = settingId(me, first);
    expect(await me.send([putSetting(id, first)])).toEqual(applied);
    expect(await other.send([putSetting(id, await defaultGym(other))])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
  });

  it.each([
    {
      name: "descending ranges",
      load_ranges: ranges([
        { min: 10, max: 20, step: 1 },
        { min: 1, max: 5, step: 1 },
      ]),
    },
    { name: "a zero step", load_ranges: ranges([{ min: 1, max: 20, step: 0 }]) },
    {
      name: "an open range that is not last",
      load_ranges: ranges([
        { min: 1, max: null, step: 1 },
        { min: 5, max: 9, step: 1 },
      ]),
    },
    { name: "text that is not JSON", load_ranges: "[" },
    { name: "an unknown key", load_ranges: ranges([{ min: 1, max: 5, step: 1, extra: true }]) },
  ])("refuses $name", async ({ load_ranges }) => {
    const me = await writer(`gym-bad-${Math.random().toString(36).slice(2)}@example.com`);
    const first = await defaultGym(me);
    expect(await me.send([putSetting(settingId(me, first), first, { load_ranges })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
  });

  it("stores a cap without a step, and refuses one among ranges", async () => {
    const me = await writer("gym-cap-only@example.com");
    const first = await defaultGym(me);
    const id = settingId(me, first);
    expect(
      await me.send([
        putSetting(id, first, { load_ranges: ranges([{ min: 0, max: 90, step: null }]) }),
      ]),
    ).toEqual(applied);
    expect(JSON.parse(String((await stored("gym_exercise_setting", id))?.load_ranges))).toEqual([
      { min: 0, max: 90, step: null },
    ]);
    expect(
      await me.send([
        op("PATCH", "gym_exercise_setting", id, {
          load_ranges: ranges([
            { min: 0, max: 90, step: null },
            { min: 100, max: null, step: 5 },
          ]),
        }),
      ]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
  });

  it("refuses settings for another user's gym, a missing exercise or a moved row", async () => {
    const me = await writer("gym-setting-owner@example.com");
    const other = await writer("gym-setting-other@example.com");
    const first = await defaultGym(me);
    const theirs = await defaultGym(other);
    expect(await me.send([putSetting(settingId(me, theirs), theirs)])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    const missing = uuidv7();
    expect(
      await me.send([putSetting(settingId(me, first, missing), first, { exercise_id: missing })]),
    ).toMatchObject(rejected("SESSION_PARENT_NOT_FOUND"));
    const id = settingId(me, first);
    expect(await me.send([putSetting(id, first)])).toEqual(applied);
    const garage = uuidv7();
    expect(await me.send([putGym(garage, "Garage")])).toEqual(applied);
    expect(await me.send([putSetting(id, garage)])).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(
      await other.send([op("PATCH", "gym_exercise_setting", id, { setup_note: "x" })]),
    ).toMatchObject(rejected("SYNC_ROW_NOT_FOUND"));
  });

  it("records the gym of a Session, keeps a Session whose gym is gone, refuses another user's gym", async () => {
    const me = await writer("gym-session@example.com");
    const other = await writer("gym-session-other@example.com");
    const first = await defaultGym(me);
    const garage = uuidv7();
    const s1 = uuidv7();
    const s2 = uuidv7();
    const s3 = uuidv7();
    expect(
      await me.send([putGym(garage, "Garage"), putSession(s1, { gym_id: first }), putSession(s2)]),
    ).toEqual(applied);
    expect(await stored("training_session", s1)).toMatchObject({ gym_id: first });
    expect(await stored("training_session", s2)).toMatchObject({ gym_id: null });
    // Change the gym during the Session, and back to any gym.
    expect(await me.send([op("PATCH", "training_session", s2, { gym_id: garage })])).toEqual(
      applied,
    );
    expect(await stored("training_session", s2)).toMatchObject({ gym_id: garage });
    // A Session written offline against a gym that has since been deleted is kept, with no gym.
    expect(await me.send([op("DELETE", "gym", garage)])).toEqual(applied);
    expect(await me.send([putSession(s3, { gym_id: garage })])).toEqual(applied);
    expect(await stored("training_session", s3)).toMatchObject({ gym_id: null });
    expect(await other.send([putSession(uuidv7(), { gym_id: first })])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await other.send([putSession(uuidv7(), { gym_id: "not-a-uuid" })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
  });

  it("deleting a gym takes its kit and settings, nulls its Sessions and leaves other gyms alone", async () => {
    const me = await writer("gym-cascade@example.com");
    const first = await defaultGym(me);
    const garage = uuidv7();
    const kitHome = uuidv7();
    const kitGarage = uuidv7();
    const setGarage = settingId(me, garage);
    const setHome = settingId(me, first);
    const sGarage = uuidv7();
    const sHome = uuidv7();
    expect(
      await me.send([
        putGym(garage, "Garage"),
        putEquipment(kitHome, { gym_id: first }),
        putEquipment(kitGarage, { gym_id: garage }),
        putSetting(setGarage, garage),
        putSetting(setHome, first),
        putSession(sGarage, { gym_id: garage }),
        putSession(sHome, { gym_id: first }),
      ]),
    ).toEqual(applied);
    expect(await me.send([op("DELETE", "gym", garage)])).toEqual(applied);
    expect((await stored("gym_equipment", kitGarage))?.deleted_at).not.toBeNull();
    expect((await stored("gym_exercise_setting", setGarage))?.deleted_at).not.toBeNull();
    expect(await stored("training_session", sGarage)).toMatchObject({ gym_id: null });
    expect((await stored("gym_equipment", kitHome))?.deleted_at).toBeNull();
    expect((await stored("gym_exercise_setting", setHome))?.deleted_at).toBeNull();
    expect(await stored("training_session", sHome)).toMatchObject({ gym_id: first });
  });

  it("deleting a gym takes a kit larger than one upload with it", async () => {
    const me = await writer("gym-cascade-large@example.com");
    const garage = uuidv7();
    expect(await me.send([putGym(garage, "Garage")])).toEqual(applied);
    await app.rows(
      sql`INSERT INTO gym_equipment (id, user_id, gym_id, kind, weight_kg, unit, count, enabled)
        SELECT uuidv7(), ${me.userId}, ${garage}, 'plate', n / 10.0, 'kg', NULL, true
        FROM generate_series(1, 250) AS n`,
    );
    expect(await me.send([op("DELETE", "gym", garage)])).toEqual(applied);
    const [left] = await app.rows(
      sql`SELECT count(*)::int AS n FROM gym_equipment WHERE gym_id = ${garage} AND deleted_at IS NULL`,
    );
    expect(left).toMatchObject({ n: 0 });
  });

  it("carries a kit written without a gym (an older app) into the default gym", async () => {
    const me = await writer("gym-legacy@example.com");
    const first = await defaultGym(me);
    const kit = Array.from({ length: 3 }, () => uuidv7());
    expect(await me.send(kit.map((id) => putEquipment(id)))).toEqual(applied);
    for (const id of kit)
      expect(await stored("gym_equipment", id)).toMatchObject({ gym_id: first });
  });
});
