import { gymExerciseSettingId, SYNC_LIMITS } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { savePreferences } from "../../preferences";
import { write } from "../store-common";
import { watchEquipment } from "../watch";
import { startSession } from "../sessions/session-store";
import { seedEquipment, upsertEquipment } from "../sessions/equipment-store";
import {
  CURL,
  SQUAT,
  pushWorkout,
  setupSessions,
  type Sessions,
} from "../sessions/session-fixtures";
import {
  activeGymIdOf,
  createGym,
  deleteGym,
  renameGym,
  setGymAvailability,
  setGymEquipmentHere,
  setGymExerciseSetting,
  setSessionGym,
} from "./gym-store";
import { EQUIPMENT_SQL } from "../sessions/session-watch";
import { readGymLoadInputs, watchGyms, type GymRow } from "./gym-watch";

/** A synced "My gym", as the server delivers it. */
function deliverGym(s: Sessions, id: string, createdAt: string, name = "My gym") {
  s.sqlite
    .prepare("INSERT INTO gym (id, user_id, name, created_at) VALUES (?, 'owner', ?, ?)")
    .run(id, name, createdAt);
}
const HOME = "0192f0a0-0000-7000-8000-0000000000a1";
const sync = (s: Sessions) => ({ installId: s.installId, owner: "owner" });

describe("the active gym", () => {
  it("is the oldest gym until one is chosen, and none before the first sync", async () => {
    const s = await setupSessions();
    expect(await write(s.training, s.installId, (tx) => activeGymIdOf(tx))).toBeNull();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const second = await createGym(s.training, { name: "Garage", copyKitFrom: null }, s.installId);
    const read = () => write(s.training, s.installId, (tx) => activeGymIdOf(tx));
    expect(await read()).toBe(HOME);
    await savePreferences(s.training, { ui: { activeGymId: second } }, sync(s));
    expect(await read()).toBe(second);
    // A saved choice that is gone reads as the default gym.
    s.sqlite.prepare("DELETE FROM gym WHERE id = ?").run(second);
    expect(await read()).toBe(HOME);
  });
});

describe("kit and gyms", () => {
  it("watches all gyms across page boundaries that share a creation time", async () => {
    const s = await setupSessions();
    const ids = Array.from(
      { length: 51 },
      (_, i) => `0192f0a0-0000-7000-8000-${String(i).padStart(12, "0")}`,
    );
    for (const id of ids) deliverGym(s, id, "2026-11-01T00:00:00Z");
    const added = await createGym(s.training, { name: "Garage", copyKitFrom: null }, s.installId);
    const rows = await new Promise<GymRow[]>((resolve, reject) => {
      const stop = watchGyms(s.training, {
        onGyms: (gyms) => {
          stop();
          resolve(gyms);
        },
        onError: (error) => {
          stop();
          reject(error);
        },
      });
    });
    expect(rows.map((row) => row.id)).toEqual([...ids, added]);
  });

  it("seeds the default kit into the active gym", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    await seedEquipment(s.training, s.installId);
    const rows = s.all("gym_equipment");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row["gym_id"] === HOME)).toBe(true);
  });

  it("a new gym copies the kit of the gym it is made from, including rows that predate gyms", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    await upsertEquipment(
      s.training,
      [
        { kind: "bar", weight_kg: 20, unit: "kg", label: null, count: null, enabled: true },
        { kind: "plate", weight_kg: 10, unit: "kg", label: null, count: 4, enabled: false },
      ],
      s.installId,
      null,
    );
    const copy = await createGym(s.training, { name: "Garage", copyKitFrom: HOME }, s.installId);
    const copied = s.sqlite
      .prepare("SELECT kind, weight_kg, count, enabled, gym_id FROM gym_equipment WHERE gym_id = ?")
      .all(copy);
    expect(copied).toHaveLength(2);
    expect(copied).toContainEqual({
      kind: "plate",
      weight_kg: 10,
      count: 4,
      enabled: 0,
      gym_id: copy,
    });
    expect(s.all("gym_equipment")).toHaveLength(4);
  });

  it("renames, and refuses a name that is empty", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    expect(await renameGym(s.training, HOME, "Iron Works", s.installId)).toBe(true);
    expect(s.one("gym", HOME)).toMatchObject({ name: "Iron Works" });
    await expect(renameGym(s.training, HOME, "  ", s.installId)).rejects.toThrow();
    expect(await renameGym(s.training, "nope", "X", s.installId)).toBe(false);
  });

  it("keeps the equipment a gym lacks and its dumbbell max, defaulting to all of it", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const rows = () =>
      new Promise<GymRow[]>((resolve, reject) => {
        const stop = watchGyms(s.training, {
          onGyms: (gyms) => {
            stop();
            resolve(gyms);
          },
          onError: reject,
        });
      });
    expect(await rows()).toMatchObject([
      { id: HOME, unavailableEquipment: [], dumbbellMaxKg: null },
    ]);

    // Stored in the catalog's order, so two devices that tick the same boxes agree.
    expect(
      await setGymAvailability(
        s.training,
        HOME,
        { unavailableEquipment: ["machine", "cable", "cable"], dumbbellMaxKg: 32.5 },
        s.installId,
      ),
    ).toBe(true);
    expect(s.one("gym", HOME)).toMatchObject({
      unavailable_equipment: '["machine","cable"]',
      dumbbell_max_kg: 32.5,
    });
    expect(await rows()).toMatchObject([
      { unavailableEquipment: ["machine", "cable"], dumbbellMaxKg: 32.5 },
    ]);

    // A field left out stays; null clears the max.
    await setGymAvailability(s.training, HOME, { dumbbellMaxKg: null }, s.installId);
    expect(await rows()).toMatchObject([
      { unavailableEquipment: ["machine", "cable"], dumbbellMaxKg: null },
    ]);
    await setGymAvailability(s.training, HOME, { unavailableEquipment: [] }, s.installId);
    expect(await rows()).toMatchObject([{ unavailableEquipment: [], dumbbellMaxKg: null }]);
  });

  it("applies each equipment toggle to the current row", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    await setGymEquipmentHere(s.training, HOME, "cable", false, s.installId);
    await setGymEquipmentHere(s.training, HOME, "machine", false, s.installId);
    expect(s.one("gym", HOME)).toMatchObject({ unavailable_equipment: '["machine","cable"]' });
    await setGymEquipmentHere(s.training, HOME, "cable", true, s.installId);
    expect(s.one("gym", HOME)).toMatchObject({ unavailable_equipment: '["machine"]' });
    expect(await setGymEquipmentHere(s.training, "nope", "cable", false, s.installId)).toBe(false);
  });

  it("refuses bodyweight, a zero max and a gym that is gone", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    await expect(
      setGymAvailability(s.training, HOME, { unavailableEquipment: ["none"] }, s.installId),
    ).rejects.toThrow();
    await expect(
      setGymAvailability(s.training, HOME, { dumbbellMaxKg: 0 }, s.installId),
    ).rejects.toThrow();
    expect(await setGymAvailability(s.training, "nope", { dumbbellMaxKg: 20 }, s.installId)).toBe(
      false,
    );
  });

  it("reads a gym's equipment and dumbbell max for work with no screen", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    await setGymAvailability(
      s.training,
      HOME,
      { unavailableEquipment: ["kettlebell"], dumbbellMaxKg: 40 },
      s.installId,
    );
    const session = await startSession(s.training, {
      workoutId: (await pushWorkout(s)).workoutId,
      derivedTitle: "A",
    });
    expect(await readGymLoadInputs(s.training, session)).toMatchObject({
      gymId: HOME,
      dumbbellMaxKg: 40,
      unavailableEquipment: ["kettlebell"],
    });
  });

  it("deletes only the gym row, never the last gym, and readers ignore what hung off it", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    expect(await deleteGym(s.training, HOME, s.installId)).toBe(false);
    const garage = await createGym(s.training, { name: "Garage", copyKitFrom: null }, s.installId);
    await upsertEquipment(
      s.training,
      [{ kind: "bar", weight_kg: 15, unit: "kg", label: null, count: null, enabled: true }],
      s.installId,
      garage,
    );
    await setGymExerciseSetting(
      s.training,
      { gymId: garage, exerciseId: SQUAT },
      { setup_note: "Seat 4" },
      s.installId,
    );
    const onEquipment = vi.fn();
    const stop = watchEquipment(
      s.training,
      {
        onEquipment,
        onError: (error) => {
          throw error;
        },
      },
      {
        gymId: garage,
        unassigned: false,
      },
    );
    try {
      expect(onEquipment).toHaveBeenLastCalledWith([expect.objectContaining({ weightKg: 15 })]);
      expect(await deleteGym(s.training, garage, s.installId)).toBe(true);
      s.notifyTable("gym");
      expect(onEquipment).toHaveBeenLastCalledWith([]);
    } finally {
      stop();
    }
    expect(s.all("gym").map((row) => row["id"])).toEqual([HOME]);
    // The server takes the kit and settings down with the gym; a delete here is one write.
    expect(s.all("gym_equipment")).toHaveLength(1);
    expect(s.all("gym_exercise_setting")).toHaveLength(1);
    expect(s.sqlite.prepare(EQUIPMENT_SQL).all(garage, "0")).toEqual([]);
    expect(
      await setGymExerciseSetting(
        s.training,
        { gymId: garage, exerciseId: CURL },
        { setup_note: "Pin 2" },
        s.installId,
      ),
    ).toBeNull();
    const session = await startSession(s.training, {
      workoutId: (await pushWorkout(s)).workoutId,
      derivedTitle: "A",
    });
    await setSessionGym(s.training, session, garage, s.installId);
    const read = await readGymLoadInputs(s.training, session);
    expect(read).toMatchObject({ gymId: HOME, settings: [], kit: [] });
  });

  it("deleting a gym with a large kit is one write, not one per row", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const garage = await createGym(s.training, { name: "Garage", copyKitFrom: null }, s.installId);
    const items = Array.from({ length: 150 }, (_, i) => ({
      kind: "plate" as const,
      weight_kg: 1 + i / 10,
      unit: "kg" as const,
      label: null,
      count: null,
      enabled: true,
    }));
    await upsertEquipment(s.training, items, s.installId, garage);
    const write = vi.spyOn(s.training, "writeTransaction");
    expect(await deleteGym(s.training, garage, s.installId)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("copies a large kit in transactions of at most the upload limit", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const items = Array.from({ length: 2 * SYNC_LIMITS.maxOps + 30 }, (_, i) => ({
      kind: "plate" as const,
      weight_kg: 1 + i / 10,
      unit: "kg" as const,
      label: null,
      count: null,
      enabled: true,
    }));
    for (let at = 0; at < items.length; at += 100)
      await upsertEquipment(s.training, items.slice(at, at + 100), s.installId, HOME);
    const write = vi.spyOn(s.training, "writeTransaction");
    const copy = await createGym(s.training, { name: "Garage", copyKitFrom: HOME }, s.installId);
    const copied = s.sqlite.prepare("SELECT COUNT(*) AS n FROM gym_equipment WHERE gym_id = ?");
    expect(copied.get(copy)).toEqual({ n: items.length });
    // The gym with the first rows, then the rest at the limit.
    expect(write).toHaveBeenCalledTimes(Math.ceil((items.length + 1) / SYNC_LIMITS.maxOps));
  });

  it("does not copy the kit of a gym that is gone", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const garage = await createGym(s.training, { name: "Garage", copyKitFrom: null }, s.installId);
    await upsertEquipment(
      s.training,
      [{ kind: "bar", weight_kg: 15, unit: "kg", label: null, count: null, enabled: true }],
      s.installId,
      garage,
    );
    await deleteGym(s.training, garage, s.installId);
    const copy = await createGym(s.training, { name: "Shed", copyKitFrom: garage }, s.installId);
    expect(s.sqlite.prepare("SELECT id FROM gym_equipment WHERE gym_id = ?").all(copy)).toEqual([]);
  });

  it("seeds the default kit although a deleted gym's rows are still on the device", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const garage = await createGym(s.training, { name: "Garage", copyKitFrom: null }, s.installId);
    await upsertEquipment(
      s.training,
      [{ kind: "bar", weight_kg: 15, unit: "kg", label: null, count: null, enabled: true }],
      s.installId,
      garage,
    );
    await deleteGym(s.training, garage, s.installId);
    await seedEquipment(s.training, s.installId, HOME);
    const seeded = s.sqlite.prepare("SELECT gym_id FROM gym_equipment WHERE gym_id = ?").all(HOME);
    expect(seeded.length).toBeGreaterThan(0);
  });
});

describe("exercise settings per gym", () => {
  it("creates, changes only what is given and removes an emptied row", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const target = { gymId: HOME, exerciseId: SQUAT };
    const id = await setGymExerciseSetting(
      s.training,
      target,
      { load_ranges: [{ min: 5, max: 91, step: 1 }] },
      s.installId,
    );
    expect(s.one("gym_exercise_setting", id ?? "")).toMatchObject({
      gym_id: HOME,
      exercise_id: SQUAT,
      load_ranges: JSON.stringify([{ min: 5, max: 91, step: 1 }]),
      setup_note: null,
    });
    await setGymExerciseSetting(s.training, target, { setup_note: "Seat 4, pin 7" }, s.installId);
    expect(s.one("gym_exercise_setting", id ?? "")).toMatchObject({
      setup_note: "Seat 4, pin 7",
      load_ranges: JSON.stringify([{ min: 5, max: 91, step: 1 }]),
    });
    await setGymExerciseSetting(s.training, target, { load_ranges: [] }, s.installId);
    expect(
      await setGymExerciseSetting(s.training, target, { setup_note: null }, s.installId),
    ).toBeNull();
    expect(s.all("gym_exercise_setting")).toEqual([]);
  });

  it("makes the same row on every device, so a later edit finds it", async () => {
    const [a, b] = [await setupSessions(), await setupSessions()];
    for (const device of [a, b]) deliverGym(device, HOME, "2026-11-01T00:00:00Z");
    const target = { gymId: HOME, exerciseId: SQUAT };
    const first = await setGymExerciseSetting(
      a.training,
      target,
      { load_ranges: [{ min: 5, max: 91, step: 1 }] },
      a.installId,
    );
    const second = await setGymExerciseSetting(
      b.training,
      target,
      { setup_note: "Seat 4" },
      b.installId,
    );
    expect(first).toBe(second);
    expect(first).toBe(gymExerciseSettingId({ userId: "owner", ...target }));
    const other = await setGymExerciseSetting(
      a.training,
      { gymId: HOME, exerciseId: CURL },
      { setup_note: "Pin 2" },
      a.installId,
    );
    expect(other).not.toBe(first);
  });

  it("keeps editing a row that an older build made under another id", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const legacy = "0192f0a0-0000-7000-8000-0000000000bb";
    s.sqlite
      .prepare(
        "INSERT INTO gym_exercise_setting (id, user_id, gym_id, exercise_id, load_ranges, setup_note, created_at) VALUES (?, 'owner', ?, ?, '[]', 'Seat 1', 'now')",
      )
      .run(legacy, HOME, SQUAT);
    const id = await setGymExerciseSetting(
      s.training,
      { gymId: HOME, exerciseId: SQUAT },
      { setup_note: "Seat 2" },
      s.installId,
    );
    expect(id).toBe(legacy);
    expect(s.all("gym_exercise_setting")).toHaveLength(1);
  });

  it("does not create a row for nothing", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    expect(
      await setGymExerciseSetting(
        s.training,
        { gymId: HOME, exerciseId: SQUAT },
        { load_ranges: [] },
        s.installId,
      ),
    ).toBeNull();
    expect(s.all("gym_exercise_setting")).toEqual([]);
  });

  it("refuses ranges that are not ascending", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    await expect(
      setGymExerciseSetting(
        s.training,
        { gymId: HOME, exerciseId: SQUAT },
        { load_ranges: [{ min: 10, max: 5, step: 1 }] },
        s.installId,
      ),
    ).rejects.toThrow();
  });
});

describe("Sessions and gyms", () => {
  it("a Session starts at the active gym and can change gym", async () => {
    const s = await setupSessions();
    deliverGym(s, HOME, "2026-11-01T00:00:00Z");
    const garage = await createGym(s.training, { name: "Garage", copyKitFrom: null }, s.installId);
    const plan = await pushWorkout(s);
    const first = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "A" });
    expect(s.one("training_session", first)).toMatchObject({ gym_id: HOME });
    expect(await setSessionGym(s.training, first, garage, s.installId)).toBe(true);
    expect(s.one("training_session", first)).toMatchObject({ gym_id: garage });
    expect(await setSessionGym(s.training, first, null, s.installId)).toBe(true);
    expect(s.one("training_session", first)).toMatchObject({ gym_id: null });
    expect(await setSessionGym(s.training, "missing", garage, s.installId)).toBe(false);
  });

  it("a Session before the first sync has no gym", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "A" });
    expect(s.one("training_session", id)).toMatchObject({ gym_id: null });
  });
});
