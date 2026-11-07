import { describe, expect, it } from "vitest";

import { classifySlots, thresholdsFromMegabytes, type SlotRow } from "./slot-lag";

const GB = 1024 ** 3;
const thresholds = thresholdsFromMegabytes(1024, 3072);

const slot = (overrides: Partial<SlotRow> = {}): SlotRow => ({
  slot_name: "powersync_1_abcd",
  active: true,
  wal_status: "reserved",
  lag_bytes: 0,
  safe_wal_size: 4 * GB,
  invalidation_reason: null,
  ...overrides,
});

describe("classifySlots", () => {
  it("treats no slot as absent, not critical", () => {
    expect(classifySlots([], thresholds)).toEqual({ status: "absent", slots: [] });
  });

  it("is ok below the warn threshold", () => {
    expect(classifySlots([slot({ lag_bytes: GB - 1 })], thresholds).status).toBe("ok");
  });

  it("warns from 1 GB and is critical from 3 GB", () => {
    expect(classifySlots([slot({ lag_bytes: GB })], thresholds).status).toBe("warn");
    expect(classifySlots([slot({ lag_bytes: 3 * GB - 1 })], thresholds).status).toBe("warn");
    expect(classifySlots([slot({ lag_bytes: 3 * GB })], thresholds).status).toBe("critical");
  });

  it("is critical for a lost or invalidated slot whatever its lag", () => {
    expect(classifySlots([slot({ wal_status: "lost" })], thresholds).status).toBe("critical");
    const invalidated = classifySlots([slot({ invalidation_reason: "wal_removed" })], thresholds);
    expect(invalidated.status).toBe("critical");
    expect(invalidated.slots[0]?.invalidated).toBe(true);
  });

  it("is critical when the slot is past its WAL budget", () => {
    expect(classifySlots([slot({ wal_status: "unreserved" })], thresholds).status).toBe("critical");
  });

  it("reports the worst slot and keeps each slot's own level", () => {
    const report = classifySlots(
      [slot({ slot_name: "a" }), slot({ slot_name: "b", lag_bytes: 4 * GB })],
      thresholds,
    );
    expect(report.status).toBe("critical");
    expect(report.slots.map((s) => s.level)).toEqual(["ok", "critical"]);
  });

  it("does not alarm on a slot whose lag is unknown", () => {
    expect(classifySlots([slot({ lag_bytes: null })], thresholds).status).toBe("ok");
  });
});
