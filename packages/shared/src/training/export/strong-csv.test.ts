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

const utc = { timeZone: "UTC" };

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
      utc,
    );
    expect(csv.split("\r\n")).toEqual([
      "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
      '2026-01-02 23:30:00,"Push",1h 5m,"Bench Press",W,60,10,0,0,"","",',
      '2026-01-02 23:30:00,"Push",1h 5m,"Bench Press",1,100,5,0,0,,,8',
      '2026-01-02 23:30:00,"Push",1h 5m,"Bench Press",D,80,8,0,0,,,',
      '2026-01-02 23:30:00,"Push",1h 5m,"Bench Press",2,100,5,0,0,,,8',
      '2026-01-02 23:30:00,"Push",1h 5m,"Bench Press",F,100,5,0,0,,,',
      '2026-01-02 23:30:00,"Push",1h 5m,"Dip",1,0,12,0,0,"",,',
      '2026-01-09 10:00:00,"Push",1h 5m,"Bench Press",1,100,5,0,0,"","",8',
      "",
    ]);
  });

  it("keeps the stored kilograms of a pound entry and uses the supplied time zone", () => {
    const [, line] = strongCsv([row({ weightKg: 45 * KG_PER_LB })], {
      timeZone: "Pacific/Auckland",
    }).split("\r\n");
    // 23:30 UTC on the 2nd is 12:30 on the 3rd in Auckland (summer time).
    expect(line).toBe('2026-01-03 12:30:00,"Push",1h 5m,"Bench Press",1,20.41165665,5,0,0,"","",8');
  });

  it("writes timed and distance sets in Seconds and metres", () => {
    const [, line] = strongCsv(
      [row({ weightKg: null, reps: null, rpe: null, durationS: 90, distanceM: 400 })],
      utc,
    ).split("\r\n");
    expect(line).toBe('2026-01-02 23:30:00,"Push",1h 5m,"Bench Press",1,0,0,400,90,"","",');
  });

  it("writes exercise and workout notes once, with unicode, quotes and newlines", () => {
    const lines = strongCsv(
      [
        row({ sessionNote: "训练, tight\nshoulder", exerciseNote: 'Paused "touch"' }),
        row({ sessionNote: "训练, tight\nshoulder", exerciseNote: 'Paused "touch"' }),
        row({ exerciseKey: "e2", sessionNote: "训练, tight\nshoulder", exerciseNote: "第二组" }),
      ],
      utc,
    );
    expect(lines).toContain('"Paused ""touch""","训练, tight\nshoulder",8\r\n');
    expect(lines).toContain(',"第二组",,8\r\n');
    expect(lines.match(/Paused/g)).toHaveLength(1);
    expect(lines.match(/训练/g)).toHaveLength(1);
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
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell("\n=1+1")).toBe('"\'\n=1+1"');
    expect(csvCell("plain")).toBe('"plain"');
  });

  it("is only the header without sets", () => {
    expect(strongCsv([], utc).split("\r\n")).toHaveLength(2);
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
      exerciseKey: "assisted",
      exercise: "Pull Up (Assisted)",
      weightKg: 12.345,
      reps: 10,
      rpe: null,
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
    "Pull Up (Assisted)": "bodyweight_assisted_reps",
    Plank: "duration",
    Running: "distance_duration",
  };
  const resolve = (name: string): ExerciseTarget | null => {
    const type = types[name];
    return type ? { exerciseId: name, title: name, type } : null;
  };

  function roundTrip() {
    const csv = strongCsv(rows, utc);
    const result = parseHistoryCsv(csv, utc);
    if (!result.ok) throw new Error(result.reason);
    return result.history;
  }

  it("is read as a Strong file with the same workouts, dates, notes and sets", () => {
    const history = roundTrip();
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
      ["Pull Up (Assisted)", null, 1],
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

  it("plans the same weights, including assistance, and retains bodyweight and timed sets", () => {
    const planned = roundTrip().sessions.map((s) => planSession(s, resolve, "kg", "Workout"));
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
      [["working", 12.345, 10]],
    ]);
    expect(push.session.exercises[2]?.sets[0]?.durationS).toBe(60);
  });
});
