import { describe, expect, it } from "vitest";

import { EXERCISE_TYPES, SET_FIELDS } from "../exercise/vocabulary";
import {
  exerciseSettingInput,
  gymEquipmentInput,
  sessionExerciseInput,
  sessionInput,
  sessionSetSchema,
  sessionStartAllowed,
  sessionTimesConsistent,
  SET_VALUE_KEYS,
} from "./session-inputs";
import { SESSION_LIMITS } from "./vocabulary";

const id = "0192f0a0-0000-7000-8000-000000000001";
const session = {
  workout_id: null,
  program_id: null,
  run_id: null,
  slot_id: null,
  cycle: null,
  title: "Push",
  title_derived: false,
  note: null,
  started_at: "2026-01-01T10:00:00.000Z",
  finished_at: null,
  duration_s: null,
  device_id: id,
  rest_set_id: null,
  rest_started_at: null,
  rest_ends_at: null,
};
const emptySet = {
  session_exercise_id: id,
  position: "a0",
  kind: "working",
  weight_kg: null,
  reps: null,
  duration_s: null,
  distance_m: null,
  floors: null,
  steps: null,
  rpe: null,
  completed_at: null,
  timer_started_at: null,
  target: null,
} as const;

describe("limits", () => {
  it("are the ADR's", () => {
    expect(SESSION_LIMITS).toMatchObject({
      exercisesPerSession: 40,
      setsPerExercise: 20,
      titleMin: 1,
      titleMax: 100,
      noteMax: 1000,
      durationMaxSeconds: 86_400,
      backfillYears: 10,
    });
  });
});

describe("sessionInput", () => {
  it("accepts a Session and refuses unknown keys and out-of-range values", () => {
    expect(sessionInput.safeParse(session).success).toBe(true);
    expect(sessionInput.safeParse({ ...session, user_id: "x" }).success).toBe(false);
    expect(sessionInput.safeParse({ ...session, title: "" }).success).toBe(false);
    expect(sessionInput.safeParse({ ...session, title: "x".repeat(101) }).success).toBe(false);
    expect(sessionInput.safeParse({ ...session, note: "x".repeat(1001) }).success).toBe(false);
    expect(sessionInput.safeParse({ ...session, duration_s: 86_401 }).success).toBe(false);
    expect(sessionInput.safeParse({ ...session, duration_s: 86_400 }).success).toBe(true);
    expect(sessionInput.safeParse({ ...session, started_at: "yesterday" }).success).toBe(false);
    expect(sessionInput.safeParse({ ...session, cycle: 0 }).success).toBe(false);
  });

  it("checks the backfill window: up to 10 years back, not in the future", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(sessionStartAllowed("2026-11-10T11:59:00Z", now)).toBe(true);
    expect(sessionStartAllowed("2016-11-10T12:00:00Z", now)).toBe(true);
    expect(sessionStartAllowed("2016-11-10T11:59:59Z", now)).toBe(false);
    expect(sessionStartAllowed("2026-11-11T12:00:00Z", now)).toBe(false);
    expect(sessionStartAllowed("2026-11-10T12:05:00Z", now)).toBe(true);
    expect(sessionStartAllowed("nope", now)).toBe(false);
  });

  it("keeps the times in order and a Rest whole", () => {
    expect(sessionTimesConsistent(session)).toBe(true);
    expect(sessionTimesConsistent({ ...session, finished_at: "2026-01-01T09:00:00.000Z" })).toBe(
      false,
    );
    expect(sessionTimesConsistent({ ...session, rest_started_at: session.started_at })).toBe(false);
    expect(
      sessionTimesConsistent({
        ...session,
        rest_started_at: "2026-01-01T10:05:00.000Z",
        rest_ends_at: "2026-01-01T10:03:00.000Z",
      }),
    ).toBe(false);
    expect(
      sessionTimesConsistent({
        ...session,
        rest_started_at: "2026-01-01T10:05:00.000Z",
        rest_ends_at: "2026-01-01T10:07:00.000Z",
      }),
    ).toBe(true);
  });
});

describe("sessionExerciseInput", () => {
  const row = {
    session_id: id,
    exercise_id: id,
    exercise_title: "Bench press",
    exercise_type: "weight_reps",
    source_workout_exercise_id: null,
    position: "a0",
    rest_seconds: 120,
    note: null,
    superset_group: null,
    log_effort: false,
  };
  it("accepts a snapshot and refuses an unknown type or a long rest", () => {
    expect(sessionExerciseInput.safeParse(row).success).toBe(true);
    expect(sessionExerciseInput.safeParse({ ...row, exercise_type: "yoga" }).success).toBe(false);
    expect(sessionExerciseInput.safeParse({ ...row, rest_seconds: 601 }).success).toBe(false);
    expect(sessionExerciseInput.safeParse({ ...row, exercise_title: "" }).success).toBe(false);
  });
});

describe("sessionSetSchema", () => {
  it.each(["top", "backoff", "myo"] as const)("accepts %s with logged effort", (kind) => {
    expect(sessionSetSchema("weight_reps").parse({ ...emptySet, kind, rpe: 8 }).kind).toBe(kind);
  });

  const fieldValues = {
    weight: { weight_kg: 60 },
    reps: { reps: 8 },
    duration: { duration_s: 30 },
    distance: { distance_m: 100 },
    floors: { floors: 5 },
    steps: { steps: 900 },
  } as const;

  it("accepts only the fields its type records, and effort on reps types", () => {
    for (const type of EXERCISE_TYPES) {
      const schema = sessionSetSchema(type);
      const recorded: readonly string[] = SET_FIELDS[type];
      for (const [field, value] of Object.entries(fieldValues)) {
        expect(schema.safeParse({ ...emptySet, ...value }).success, `${type} ${field}`).toBe(
          recorded.includes(field),
        );
      }
      expect(schema.safeParse({ ...emptySet, rpe: 8 }).success, `${type} rpe`).toBe(
        recorded.includes("reps"),
      );
      expect(schema.safeParse(emptySet).success).toBe(true);
    }
  });

  it("needs every recorded field on a ticked set and no 0 reps", () => {
    const schema = sessionSetSchema("weight_reps");
    const ticked = { ...emptySet, completed_at: "2026-01-01T10:00:00.000Z" };
    expect(schema.safeParse(ticked).success).toBe(false);
    expect(schema.safeParse({ ...ticked, weight_kg: 60 }).success).toBe(false);
    expect(schema.safeParse({ ...ticked, weight_kg: 60, reps: 8 }).success).toBe(true);
    expect(schema.safeParse({ ...ticked, weight_kg: 0, reps: 8 }).success).toBe(true);
    expect(schema.safeParse({ ...ticked, weight_kg: 60, reps: 0 }).success).toBe(false);
    expect(sessionSetSchema("duration").safeParse({ ...ticked, duration_s: 30 }).success).toBe(
      true,
    );
  });

  it("checks the target against the type and refuses a bad effort", () => {
    const schema = sessionSetSchema("duration");
    expect(
      schema.safeParse({ ...emptySet, target: { kind: "working", duration_s: 30 } }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...emptySet, target: { kind: "working", reps_min: 5, reps_max: 5 } })
        .success,
    ).toBe(false);
    expect(sessionSetSchema("weight_reps").safeParse({ ...emptySet, rpe: 5 }).success).toBe(false);
    expect(sessionSetSchema("weight_reps").safeParse({ ...emptySet, rpe: 7.5 }).success).toBe(true);
    expect(sessionSetSchema("weight_reps").safeParse({ ...emptySet, kind: "rest" }).success).toBe(
      false,
    );
  });

  it("maps each field to its column", () => {
    expect(SET_VALUE_KEYS).toEqual({
      weight: "weight_kg",
      reps: "reps",
      duration: "duration_s",
      distance: "distance_m",
      floors: "floors",
      steps: "steps",
    });
  });
});

describe("kit and settings inputs", () => {
  it("accepts equipment and a setting, and refuses bad kinds and counts", () => {
    const item = { kind: "plate", weight_kg: 20, unit: "kg", label: null, count: 4, enabled: true };
    expect(gymEquipmentInput.safeParse(item).success).toBe(true);
    expect(gymEquipmentInput.safeParse({ ...item, kind: "rack" }).success).toBe(false);
    expect(gymEquipmentInput.safeParse({ ...item, count: -1 }).success).toBe(false);
    expect(gymEquipmentInput.safeParse({ ...item, count: 0 }).success).toBe(false);
    expect(gymEquipmentInput.safeParse({ ...item, weight_kg: 0 }).success).toBe(false);
    expect(gymEquipmentInput.safeParse({ ...item, kind: "bar", weight_kg: 0 }).success).toBe(true);
    expect(gymEquipmentInput.safeParse({ ...item, unit: "oz" }).success).toBe(false);
    expect(gymEquipmentInput.safeParse({ ...item, weight_kg: 1001 }).success).toBe(false);
    expect(
      exerciseSettingInput.safeParse({ exercise_id: id, bar_id: null, log_effort: true }).success,
    ).toBe(true);
    expect(
      exerciseSettingInput.safeParse({ exercise_id: "x", bar_id: null, log_effort: true }).success,
    ).toBe(false);
  });
});
