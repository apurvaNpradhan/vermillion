import { describe, expect, it } from "vitest";

import { parseReceipt } from "./import-receipt";

const valid = {
  batchId: "0192f0a0-0000-7000-8000-000000000001",
  importedAt: "2026-11-20T10:00:00.000Z",
  format: "strong",
  sessions: 12,
  sets: 300,
  createdExercises: 2,
  skippedDuplicates: 1,
  skippedOther: 0,
  from: "2025-01-01T10:00:00.000Z",
  to: "2026-11-01T10:00:00.000Z",
};

describe("parseReceipt", () => {
  it("reads a saved receipt", () => {
    expect(parseReceipt(JSON.stringify(valid))).toEqual(valid);
  });

  it("returns null for nothing, bad JSON or a shape that does not fit", () => {
    expect(parseReceipt(null)).toBeNull();
    expect(parseReceipt("{")).toBeNull();
    expect(parseReceipt(JSON.stringify({ ...valid, sessions: -1 }))).toBeNull();
    expect(parseReceipt(JSON.stringify({ ...valid, format: "other" }))).toBeNull();
  });
});
