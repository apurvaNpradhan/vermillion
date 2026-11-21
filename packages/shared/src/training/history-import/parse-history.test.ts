import { describe, expect, it } from "vitest";

import { CSV_MAX_BYTES, checkCsvSize, createCsvReader, detectDelimiter, parseCsvText } from "./csv";
import { HEVY, HEVY_LBS_MILES, STRONG_COMMA, STRONG_SEMICOLON, STRONG_UNITS } from "./fixtures";
import {
  detectDayFirst,
  normalizeEffort,
  parseDurationText,
  parseHistoryCsv,
  parseWallClock,
  wallClockToIso,
} from "./parse-history";

function parsed(text: string) {
  const result = parseHistoryCsv(text);
  if (!result.ok) throw new Error(result.reason);
  return result.history;
}

describe("csv", () => {
  it("reads quotes, doubled quotes, embedded line breaks and CRLF", () => {
    const rows = parseCsvText('a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\r\n\r\n', ",");
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "z"],
    ]);
  });

  it("detects the delimiter from the header outside quotes", () => {
    expect(detectDelimiter("a;b;c\n1,5;2;3")).toBe(";");
    expect(detectDelimiter('"a,b",c\n1')).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });

  it("reads in slices and reports progress", () => {
    const reader = createCsvReader("a\nb\nc\nd\n");
    expect(reader.readRows(2)).toEqual([["a"], ["b"]]);
    expect(reader.done()).toBe(false);
    expect(reader.progress()).toBe(0.5);
    expect(reader.readRows(10)).toEqual([["c"], ["d"]]);
    expect(reader.done()).toBe(true);
  });

  it("ignores a byte order mark", () => {
    expect(parseCsvText("﻿a,b\n1,2")[0]).toEqual(["a", "b"]);
  });
});

describe("dates and durations", () => {
  it("reads the date layouts of both apps", () => {
    const expected = { year: 2026, month: 1, day: 15, hour: 10, minute: 30, second: 0 };
    expect(parseWallClock("2026-01-15 10:30:00", true)).toEqual(expected);
    expect(parseWallClock("15 Jan 2026, 10:30", true)).toEqual(expected);
    expect(parseWallClock("Jan 15, 2026 10:30", true)).toEqual(expected);
    expect(parseWallClock("15/01/2026 10:30", true)).toEqual(expected);
    expect(parseWallClock("01/15/2026 10:30 AM", false)).toEqual(expected);
    expect(parseWallClock("01/15/2026 10:30 PM", false)?.hour).toBe(22);
    expect(parseWallClock("not a date", true)).toBeNull();
    expect(parseWallClock("2026-13-01 10:00", true)).toBeNull();
  });

  it("decides day-first from any unambiguous date", () => {
    expect(detectDayFirst(["03/04/2026", "25/04/2026"])).toBe(true);
    expect(detectDayFirst(["03/04/2026", "04/25/2026"])).toBe(false);
    expect(detectDayFirst(["03/04/2026"])).toBe(true);
  });

  it("turns a wall-clock time into the device's instant, and refuses a day that is not real", () => {
    const clock = { year: 2026, month: 3, day: 2, hour: 18, minute: 30, second: 0 };
    expect(wallClockToIso(clock)).toBe(new Date(2026, 2, 2, 18, 30, 0).toISOString());
    expect(wallClockToIso({ ...clock, month: 2, day: 31 })).toBeNull();
  });

  it("reads Strong's durations", () => {
    expect(parseDurationText("1h 5m")).toBe(3900);
    expect(parseDurationText("45m")).toBe(2700);
    expect(parseDurationText("1h")).toBe(3600);
    expect(parseDurationText("30s")).toBe(30);
    expect(parseDurationText("1:05:00")).toBe(3900);
    expect(parseDurationText("3900")).toBe(3900);
    expect(parseDurationText("65", "min")).toBe(3900);
    expect(parseDurationText("")).toBeNull();
    expect(parseDurationText("soon")).toBeNull();
  });

  it("keeps effort to halves from 6 to 10", () => {
    expect(normalizeEffort(8.3)).toBe(8.5);
    expect(normalizeEffort(5)).toBeNull();
    expect(normalizeEffort(0)).toBeNull();
    expect(normalizeEffort(11)).toBe(10);
    expect(normalizeEffort(null)).toBeNull();
  });
});

describe("Strong", () => {
  const history = parsed(STRONG_COMMA);

  it("groups rows into workouts, oldest first, and drops rest timers", () => {
    expect(history.format).toBe("strong");
    expect(history.weightUnit).toBeNull();
    expect(history.sessions.map((s) => s.title)).toEqual(["Push Day", "Run"]);
    const push = history.sessions[0];
    expect(push?.durationS).toBe(3900);
    expect(push?.note).toBe("Felt good, \n left shoulder tight");
    expect(push?.exercises.map((e) => e.name)).toEqual([
      "Bench Press (Barbell)",
      "Plank",
      "Pull Up",
    ]);
    const bench = push?.exercises[0];
    expect(bench?.sets).toHaveLength(4);
    expect(bench?.note).toBe('Paused "touch and go"');
  });

  it("maps W, D and F set orders and the effort", () => {
    const sets = history.sessions[0]?.exercises[0]?.sets ?? [];
    expect(sets.map((s) => s.kind)).toEqual(["warmup", "working", "working", "drop"]);
    expect(sets.map((s) => s.rpe)).toEqual([null, 8, 8.5, null]);
    expect(sets[1]).toMatchObject({ weight: 60, reps: 5 });
  });

  it("reads seconds and meters", () => {
    const run = history.sessions[1]?.exercises[0]?.sets[0];
    expect(run).toMatchObject({ durationS: 1800, distanceM: 5000 });
  });

  it("takes the unit and the duration seconds from a header with units", () => {
    const units = parsed(STRONG_UNITS);
    expect(units.weightUnit).toBe("lb");
    expect(units.sessions[0]?.durationS).toBe(3900);
    expect(units.sessions[0]?.exercises[0]?.sets.map((s) => s.kind)).toEqual([
      "working",
      "failure",
    ]);
  });

  it("reads a semicolon export with decimal commas and day-first dates", () => {
    const semicolon = parsed(STRONG_SEMICOLON);
    expect(semicolon.sessions).toHaveLength(2);
    expect(semicolon.sessions[0]?.exercises[0]?.sets[0]?.weight).toBe(102.5);
    expect(semicolon.sessions[0]?.start).toMatchObject({ month: 3, day: 15, hour: 18 });
    expect(semicolon.sessions[1]?.start).toMatchObject({ month: 3, day: 27 });
  });
});

describe("Hevy", () => {
  const history = parsed(HEVY);

  it("reads set types, supersets, notes and the duration from start and end", () => {
    expect(history.format).toBe("hevy");
    expect(history.weightUnit).toBe("kg");
    const upper = history.sessions[0];
    expect(upper?.durationS).toBe(72 * 60);
    expect(upper?.exercises.map((e) => e.name)).toEqual([
      "Bench Press (Barbell)",
      "Bent Over Row (Barbell)",
      "Dead Hang",
    ]);
    expect(upper?.exercises[0]?.sets.map((s) => s.kind)).toEqual(["warmup", "working", "drop"]);
    expect(upper?.exercises[0]?.supersetKey).toBe("0");
    expect(upper?.exercises[2]?.supersetKey).toBeNull();
    expect(upper?.exercises[1]?.note).toBe("Strict");
    expect(upper?.exercises[0]?.sets[1]?.rpe).toBe(8);
    expect(upper?.exercises[2]?.sets[0]).toMatchObject({ durationS: 45, weight: null });
  });

  it("converts distance in kilometers to meters", () => {
    expect(history.sessions[1]?.exercises[0]?.sets[0]).toMatchObject({
      distanceM: 5000,
      durationS: 1800,
    });
    expect(history.sessions[1]?.note).toBe("Easy pace");
  });

  it("reads pounds and miles columns", () => {
    const lbs = parsed(HEVY_LBS_MILES);
    expect(lbs.weightUnit).toBe("lb");
    expect(lbs.sessions[0]?.exercises[0]?.sets[0]?.weight).toBe(155);
    expect(lbs.sessions[1]?.exercises[0]?.sets[0]?.distanceM).toBeCloseTo(4988.9, 0);
  });
});

describe("unrecognised files", () => {
  it("refuses a file that is neither export", () => {
    expect(parseHistoryCsv("name,value\na,1\n")).toEqual({ ok: false, reason: "unknown_format" });
  });

  it("refuses a file with no workouts", () => {
    expect(parseHistoryCsv("")).toEqual({ ok: false, reason: "empty" });
    const header = STRONG_COMMA.split("\n")[0] ?? "";
    expect(parseHistoryCsv(`${header}\n`)).toEqual({ ok: false, reason: "empty" });
  });

  it("counts rows it cannot place", () => {
    const text = `${STRONG_COMMA}not a date,X,1m,Curl,1,10,10,0,0,,,\n`;
    expect(parsed(text).skippedRows).toBe(1);
  });
});

describe("review regression cases", () => {
  it("reads Strong workout duration, per-row units and quoted decimal commas", () => {
    const text = `Date,Workout Name,Workout Duration,Exercise Name,Set Order,Weight,Weight Unit,Distance,Distance Unit,Reps
2026-03-02 18:30:00,Legs,1h 14m,Squat,1,"102,5",lb,"1,25",mi,5
2026-03-02 18:30:00,Legs,1h 14m,Squat,2,50,kg,2,km,6
2026-03-02 18:30:00,Legs,1h 14m,Squat,3,25,,10,m,7
`;
    const workout = parsed(text).sessions[0];
    expect(workout?.durationS).toBe(4440);
    expect(workout?.exercises[0]?.sets).toMatchObject([
      { weight: 102.5, weightUnit: "lb", distanceM: 2011.68 },
      { weight: 50, weightUnit: "kg", distanceM: 2000 },
      { weight: 25, weightUnit: null, distanceM: 10 },
    ]);
  });

  it("keeps repeated blocks and notes, sorting indexed sets within each block", () => {
    const text = `title,start_time,exercise_title,exercise_notes,superset_id,set_index,set_type,reps
A,2026-03-02 18:30:00,Squat,First,0,2,normal,12
A,2026-03-02 18:30:00,Squat,,0,0,normal,10
A,2026-03-02 18:30:00,Squat,,0,1,normal,11
A,2026-03-02 18:30:00,Row,Second,0,0,normal,8
A,2026-03-02 18:30:00,Squat,Third,1,0,normal,4
A,2026-03-02 18:30:00,Squat,Fourth,1,0,normal,2
`;
    expect(
      parsed(text).sessions[0]?.exercises.map((e) => [
        e.name,
        e.note,
        e.supersetKey,
        e.sets.map((set) => set.reps),
      ]),
    ).toEqual([
      ["Squat", "First", "0", [10, 11, 12]],
      ["Row", "Second", "0", [8]],
      ["Squat", "Third", "1", [4]],
      ["Squat", "Fourth", "1", [2]],
    ]);
  });

  it("uses the chosen date order and source zone, refusing partial or impossible timestamps", () => {
    const text = "Date,Exercise Name,Set Order,Reps\n03/04/2026 18:30,Squat,1,5";
    const day = parseHistoryCsv(text, { dayFirst: true, timeZone: "Asia/Kolkata" });
    const month = parseHistoryCsv(text, { dayFirst: false, timeZone: "UTC" });
    expect(day).toMatchObject({
      ok: true,
      history: { ambiguousDates: true, sessions: [{ startedAt: "2026-04-03T13:00:00.000Z" }] },
    });
    expect(month).toMatchObject({
      ok: true,
      history: { sessions: [{ startedAt: "2026-03-04T18:30:00.000Z" }] },
    });
    for (const invalid of [
      "2026-02-30 12:00",
      "2026-01-01 6:00 trailing",
      "2026-01-01 13:00 PM",
      "2026-01-01 06:10Z",
    ]) {
      expect(parseWallClock(invalid, true)).toBeNull();
    }
    expect(parseWallClock("2026-01-01 06:10:00.123", true)?.millisecond).toBe(123);
  });

  it("reports DST gaps and overlaps, choosing the earlier instant in an overlap", () => {
    const text =
      "Date,Exercise Name,Set Order,Reps\n2026-03-08 02:30,Squat,1,5\n2026-11-01 01:30,Squat,1,5";
    expect(parseHistoryCsv(text, { timeZone: "America/New_York" })).toMatchObject({
      ok: true,
      history: { gaps: 1, overlaps: 1, sessions: [{ startedAt: "2026-11-01T05:30:00.000Z" }] },
    });
  });

  it("rejects invalid quotes and bounds bytes, rows, columns and fields", () => {
    const header = "Date,Exercise Name,Set Order,Reps\n";
    expect(parseHistoryCsv(header + '2026-03-02 18:30,"Squat,1,5')).toEqual({
      ok: false,
      reason: "csv_syntax",
    });
    expect(() => checkCsvSize(CSV_MAX_BYTES + 1)).toThrow("csv_limit");
    expect(() => checkCsvSize(CSV_MAX_BYTES)).not.toThrow();
    for (const text of [",".repeat(128), "a".repeat(16_385), "a\n".repeat(100_001)]) {
      expect(() => parseCsvText(text)).toThrow("csv_limit");
    }
  });
});
