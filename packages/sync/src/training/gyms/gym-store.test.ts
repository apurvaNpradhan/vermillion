import { describe, expect, it } from "vitest";

import { savePreferences } from "../../preferences";
import { write } from "../store-common";
import { startSession } from "../sessions/session-store";
import { seedEquipment, upsertEquipment } from "../sessions/equipment-store";
import { SQUAT, pushWorkout, setupSessions, type Sessions } from "../sessions/session-fixtures";
import {
  activeGymIdOf,
  createGym,
  deleteGym,
  renameGym,
  setGymExerciseSetting,
  setSessionGym,
} from "./gym-store";
import { watchGyms, type GymRow } from "./gym-watch";

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

  it("deletes a gym with its kit and settings, never the last one", async () => {
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
    expect(await deleteGym(s.training, garage, s.installId)).toBe(true);
    expect(s.all("gym").map((row) => row["id"])).toEqual([HOME]);
    expect(s.all("gym_equipment")).toEqual([]);
    expect(s.all("gym_exercise_setting")).toEqual([]);
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
