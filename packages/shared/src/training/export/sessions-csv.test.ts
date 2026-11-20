import { describe, expect, it } from "vitest";

import { KG_PER_LB } from "../vocabulary/format";
import { csvCell, sessionsCsv, type SessionExportRow } from "./sessions-csv";

const row = (overrides: Partial<SessionExportRow> = {}): SessionExportRow => ({
  sessionId: "s1",
  workout: "Push",
  startedAt: "2026-01-02T23:30:00.000Z",
  sessionNote: null,
  exerciseKey: "e1",
  exercise: "Bench Press",
  exerciseNote: null,
  kind: "working",
  weightKg: 100,
  reps: 5,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  rpe: 8,
  ...overrides,
});

const options = { unit: "kg", effortScale: "rpe", timeZone: "UTC" } as const;

describe("sessionsCsv", () => {
  it("writes a header and one line per set, numbering sets within each exercise", () => {
    const csv = sessionsCsv(
      [
        row({ kind: "warmup", weightKg: 60, reps: 10, rpe: null }),
        row(),
        row({ exerciseKey: "e2", exercise: "Dip", weightKg: null, reps: 12, rpe: null }),
        row({ sessionId: "s2", startedAt: "2026-01-09T10:00:00.000Z" }),
      ],
      options,
    );
    expect(csv.split("\r\n")).toEqual([
      "date,workout,exercise,set,kind,weight_kg,reps,rpe,duration_seconds,distance_meters,floors,steps,workout_note,exercise_note",
      "2026-01-02,Push,Bench Press,1,warmup,60,10,,,,,,,",
      "2026-01-02,Push,Bench Press,2,working,100,5,8,,,,,,",
      "2026-01-02,Push,Dip,1,working,,12,,,,,,,",
      "2026-01-09,Push,Bench Press,1,working,100,5,8,,,,,,",
      "",
    ]);
  });

  it("uses the user's weight unit, effort scale and time zone", () => {
    const csv = sessionsCsv([row({ weightKg: 45 * KG_PER_LB })], {
      unit: "lb",
      effortScale: "rir",
      timeZone: "Pacific/Auckland",
    });
    const [header, line] = csv.split("\r\n");
    expect(header).toContain("weight_lb");
    expect(header).toContain(",rir,");
    // 23:30 UTC on the 2nd is the 3rd in Auckland; RPE 8 is 2 reps in reserve.
    expect(line).toBe("2026-01-03,Push,Bench Press,1,working,45,5,2,,,,,,");
  });

  it("writes timed and distance sets, floors and steps", () => {
    const [, line] = sessionsCsv(
      [
        row({
          weightKg: null,
          reps: null,
          rpe: null,
          durationS: 90,
          distanceM: 400,
          floors: 9,
          steps: 200,
        }),
      ],
      options,
    ).split("\r\n");
    expect(line).toBe("2026-01-02,Push,Bench Press,1,working,,,,90,400,9,200,,");
  });

  it("quotes notes and neutralises formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("plain")).toBe("plain");
  });

  it("is only the header without sets", () => {
    expect(sessionsCsv([], options).split("\r\n")).toHaveLength(2);
  });
});
