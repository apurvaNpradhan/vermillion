import { describe, expect, it } from "vitest";

import type { ExerciseType } from "../../exercise/vocabulary";
import { parseHistoryCsv, planSession, type ExerciseTarget } from "../history-import";
import { KG_PER_LB } from "../vocabulary/format";
import { csvCell, strongCsv, strongDuration, type SessionExportRow } from "./strong-csv";

const row = (overrides: Partial<SessionExportRow> = {}): SessionExportRow => ({
  sessionId: "s1",
  workout: "Push",
  startedAt: "2026-01-02T23:30:00.000Z",
  sessionDurationS: 3900,
  sessionNote: null,
  exerciseKey: "e1",
  exercise: "Bench Press",
  exerciseNote: null,
  kind: "working",
  weightKg: 100,
  reps: 5,
  durationS: null,
  distanceM: null,
  rpe: 8,
  ...overrides,
});

const kg = { unit: "kg", timeZone: "UTC" } as const;

describe("strongCsv", () => {
  it("writes Strong's header and one line per set, numbering working sets only", () => {
    const csv = strongCsv(
      [
        row({ kind: "warmup", weightKg: 60, reps: 10, rpe: null }),
        row(),
        row({ kind: "drop", weightKg: 80, reps: 8, rpe: null }),
        row(),
        row({ kind: "failure", rpe: null }),
        row({ exerciseKey: "e2", exercise: "Dip", weightKg: null, reps: 12, rpe: null }),
        row({ sessionId: "s2", startedAt: "2026-01-09T10:00:00.000Z" }),
      ],
      kg,
    );
    expect(csv.split("\r\n")).toEqual([
      "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
      "2026-01-02 23:30:00,Push,1h 5m,Bench Press,W,60,10,0,0,,,",
      "2026-01-02 23:30:00,Push,1h 5m,Bench Press,1,100,5,0,0,,,8",
      "2026-01-02 23:30:00,Push,1h 5m,Bench Press,D,80,8,0,0,,,",
      "2026-01-02 23:30:00,Push,1h 5m,Bench Press,2,100,5,0,0,,,8",
      "2026-01-02 23:30:00,Push,1h 5m,Bench Press,F,100,5,0,0,,,",
      "2026-01-02 23:30:00,Push,1h 5m,Dip,1,0,12,0,0,,,",
      "2026-01-09 10:00:00,Push,1h 5m,Bench Press,1,100,5,0,0,,,8",
      "",
    ]);
  });

  it("writes the weight in the user's unit and the date in their time zone", () => {
    const [, line] = strongCsv([row({ weightKg: 45 * KG_PER_LB })], {
      unit: "lb",
      timeZone: "Pacific/Auckland",
    }).split("\r\n");
    // 23:30 UTC on the 2nd is 12:30 on the 3rd in Auckland (summer time).
    expect(line).toBe("2026-01-03 12:30:00,Push,1h 5m,Bench Press,1,45,5,0,0,,,8");
  });

  it("writes timed and distance sets in Seconds and metres", () => {
    const [, line] = strongCsv(
      [row({ weightKg: null, reps: null, rpe: null, durationS: 90, distanceM: 400 })],
      kg,
    ).split("\r\n");
    expect(line).toBe("2026-01-02 23:30:00,Push,1h 5m,Bench Press,1,0,0,400,90,,,");
  });

  it("writes the exercise note once and the workout note on every line, quoted", () => {
    const lines = strongCsv(
      [
        row({ sessionNote: "Felt good, tight\nshoulder", exerciseNote: 'Paused "touch"' }),
        row({ sessionNote: "Felt good, tight\nshoulder", exerciseNote: 'Paused "touch"' }),
      ],
      kg,
    );
    expect(lines).toContain('"Paused ""touch""","Felt good, tight\nshoulder",8\r\n');
    expect(lines.match(/Paused/g)).toHaveLength(1);
    expect(lines.match(/Felt good/g)).toHaveLength(2);
  });

  it("formats durations as Strong does", () => {
    expect([strongDuration(3900), strongDuration(2700), strongDuration(null)]).toEqual([
      "1h 5m",
      "45m",
      "0m",
    ]);
  });

  it("quotes cells and neutralises formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("plain")).toBe("plain");
  });

  it("is only the header without sets", () => {
    expect(strongCsv([], kg).split("\r\n")).toHaveLength(2);
  });
});

describe("round trip through the Strong importer", () => {
  const rows: SessionExportRow[] = [
    row({
      sessionNote: "Felt good, left shoulder tight",
      exerciseNote: 'Paused "touch and go"',
      kind: "warmup",
      weightKg: 40,
      reps: 8,
      rpe: null,
    }),
    row({
      sessionNote: "Felt good, left shoulder tight",
      weightKg: 60,
      reps: 5,
      rpe: 8,
    }),
    row({ sessionNote: "Felt good, left shoulder tight", weightKg: 62.5, reps: 4, rpe: 9.5 }),
    row({
      sessionNote: "Felt good, left shoulder tight",
      kind: "drop",
      weightKg: 50,
      reps: 6,
      rpe: null,
    }),
    row({
      sessionNote: "Felt good, left shoulder tight",
      exerciseKey: "e2",
      exercise: "Pull Up",
      weightKg: null,
      reps: 10,
      rpe: null,
    }),
    row({
      sessionNote: "Felt good, left shoulder tight",
      exerciseKey: "e3",
      exercise: "Plank",
      weightKg: null,
      reps: null,
      rpe: null,
      durationS: 60,
    }),
    row({
      sessionId: "s2",
      workout: "Run",
      startedAt: "2026-01-05T07:00:00.000Z",
      sessionDurationS: 1920,
      exerciseKey: "e4",
      exercise: "Running",
      weightKg: null,
      reps: null,
      rpe: null,
      durationS: 1800,
      distanceM: 5000,
    }),
  ];

  const types: Record<string, ExerciseType> = {
    "Bench Press": "weight_reps",
    "Pull Up": "bodyweight_reps",
    Plank: "duration",
    Running: "distance_duration",
  };
  const resolve = (name: string): ExerciseTarget | null => {
    const type = types[name];
    return type ? { exerciseId: name, title: name, type } : null;
  };

  function roundTrip(unit: "kg" | "lb") {
    const csv = strongCsv(rows, { unit, timeZone: "UTC" });
    const result = parseHistoryCsv(csv, { timeZone: "UTC" });
    if (!result.ok) throw new Error(result.reason);
    return result.history;
  }

  it("is read as a Strong file with the same workouts, dates, notes and sets", () => {
    const history = roundTrip("kg");
    expect(history.format).toBe("strong");
    expect(history.skippedRows).toBe(0);
    expect(history.sessions.map((s) => [s.title, s.startedAt, s.durationS, s.note])).toEqual([
      ["Push", "2026-01-02T23:30:00.000Z", 3900, "Felt good, left shoulder tight"],
      ["Run", "2026-01-05T07:00:00.000Z", 1920, null],
    ]);
    const push = history.sessions[0];
    expect(push?.exercises.map((e) => [e.name, e.note, e.sets.length])).toEqual([
      ["Bench Press", 'Paused "touch and go"', 4],
      ["Pull Up", null, 1],
      ["Plank", null, 1],
    ]);
    expect(push?.exercises[0]?.sets.map((s) => [s.kind, s.weight, s.reps, s.rpe])).toEqual([
      ["warmup", 40, 8, null],
      ["working", 60, 5, 8],
      ["working", 62.5, 4, 9.5],
      ["drop", 50, 6, null],
    ]);
    expect(push?.exercises[2]?.sets[0]).toMatchObject({ durationS: 60 });
    expect(history.sessions[1]?.exercises[0]?.sets[0]).toMatchObject({
      durationS: 1800,
      distanceM: 5000,
    });
  });

  it("plans to the same sets in kg, bodyweight and timed sets included", () => {
    const planned = roundTrip("kg").sessions.map((s) => planSession(s, resolve, "kg", "Workout"));
    const push = planned[0];
    if (push?.kind !== "planned") throw new Error("not planned");
    expect(
      push.session.exercises.map((e) => e.sets.map((s) => [s.kind, s.weightKg, s.reps])),
    ).toEqual([
      [
        ["warmup", 40, 8],
        ["working", 60, 5],
        ["working", 62.5, 4],
        ["drop", 50, 6],
      ],
      [["working", null, 10]],
      [["working", null, null]],
    ]);
    expect(push.session.exercises[2]?.sets[0]?.durationS).toBe(60);
  });

  it("keeps pounds when the importer is told the file's unit", () => {
    const planned = roundTrip("lb").sessions.map((s) => planSession(s, resolve, "lb", "Workout"));
    const push = planned[0];
    if (push?.kind !== "planned") throw new Error("not planned");
    const bench = push.session.exercises[0]?.sets.map((s) => s.weightKg ?? 0) ?? [];
    expect(bench.map((w) => Number(w.toFixed(1)))).toEqual([40, 60, 62.5, 50]);
  });
});
