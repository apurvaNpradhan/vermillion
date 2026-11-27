import { describe, expect, it } from "vitest";

import {
  RECORD_SCHEMA_VERSION,
  BODY_CSV_HEADERS,
  bodyCsvPage,
  writeBackupJson,
  recordDate,
  recordFileName,
} from "./export-builders";

const rows = [
  {
    metric: "weight",
    value: 81.25,
    measuredAt: "2026-11-01T07:00:00.000Z",
    localDate: "2026-11-01",
    source: "manual",
  },
  {
    metric: "waist",
    value: 82,
    measuredAt: "2026-11-01T07:05:00.000Z",
    localDate: "2026-11-01",
    source: "manual",
  },
  {
    metric: "weight",
    value: 80.9,
    measuredAt: "2026-11-08T07:00:00.000Z",
    localDate: "2026-11-08",
    source: "health",
  },
] as const;

describe("record file names", () => {
  it("names the backup and each CSV by day", () => {
    expect(recordFileName("Sigil", "backup", "2026-11-24")).toBe("sigil-record-2026-11-24.json");
    expect(recordFileName("Sigil", "weights", "2026-11-24")).toBe(
      "sigil-record-weights-2026-11-24.csv",
    );
    expect(recordFileName("Sigil", "measurements", "2026-11-24")).toBe(
      "sigil-record-measurements-2026-11-24.csv",
    );
    expect(recordFileName("Sigil", "history", "2026-11-24")).toBe(
      "sigil-record-history-2026-11-24.csv",
    );
  });
  it("dates in the device's zone, not UTC", () => {
    const instant = new Date("2026-11-24T23:30:00Z");
    expect(recordDate(instant, "UTC")).toBe("2026-11-24");
    expect(recordDate(instant, "Asia/Kolkata")).toBe("2026-11-25");
  });
});

describe("body CSVs", () => {
  it("writes weights only, oldest first, in kilograms", () => {
    expect(
      (BODY_CSV_HEADERS.weights + "\r\n" + bodyCsvPage("weights", rows)).split("\r\n"),
    ).toEqual([
      "Date,Measured at,Weight (kg),Source",
      '"2026-11-01","2026-11-01T07:00:00.000Z",81.25,"manual"',
      '"2026-11-08","2026-11-08T07:00:00.000Z",80.9,"health"',
      "",
    ]);
  });
  it("writes measurements only, one line per metric reading, in centimetres", () => {
    expect(
      (BODY_CSV_HEADERS.measurements + "\r\n" + bodyCsvPage("measurements", rows)).split("\r\n"),
    ).toEqual([
      "Date,Measured at,Metric,Value (cm),Source",
      '"2026-11-01","2026-11-01T07:05:00.000Z","waist",82,"manual"',
      "",
    ]);
  });
  it("supplies no data lines for an empty or nonmatching page", () => {
    expect(bodyCsvPage("weights", [])).toBe("");
    expect(bodyCsvPage("weights", rows.slice(1, 2))).toBe("");
    expect(bodyCsvPage("measurements", rows.slice(0, 1))).toBe("");
  });
});

describe("backup JSON", () => {
  it("writes a versioned document with multiple pages and empty tables", async () => {
    const chunks: string[] = [];
    await writeBackupJson(
      {
        app: "Sigil",
        appVersion: "1.2.3",
        exportedAt: new Date("2026-11-24T10:00:00Z"),
      },
      async (writePage) => {
        await writePage("program", [{ id: "p1", title: "Upper / Lower", deleted: null }]);
        expect(chunks.join("")).toContain('"p1"');
        await writePage("program", [{ id: "p2" }]);
        await writePage("training_session", []);
        await writePage("workout", [{ id: "w1" }]);
      },
      async (chunk) => {
        chunks.push(chunk);
      },
    );
    const parsed = JSON.parse(chunks.join(""));
    expect(parsed).toEqual({
      app: "sigil",
      kind: "record",
      schemaVersion: RECORD_SCHEMA_VERSION,
      exportedAt: "2026-11-24T10:00:00.000Z",
      appVersion: "1.2.3",
      tables: {
        program: [{ id: "p1", title: "Upper / Lower", deleted: null }, { id: "p2" }],
        training_session: [],
        workout: [{ id: "w1" }],
      },
    });
  });
});
