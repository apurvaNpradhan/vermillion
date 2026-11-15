import { describe, expect, it } from "vitest";

import { cmToIn, inToCm } from "./weight";
import { changeSincePrevious, changedCanonical, formatBodyValue, lastN } from "./measurements";

describe("measurement review fixes", () => {
  it("orders same-day entries by instant, not timestamp text", () => {
    const entries = [
      { id: "a", value: 80, local_date: "2026-11-15", measured_at: "2026-11-15T12:00:00+05:30" },
      { id: "b", value: 81, local_date: "2026-11-15", measured_at: "2026-11-15T08:00:00Z" },
    ];
    expect(changeSincePrevious(entries)).toBe(1);
    expect(lastN(entries, 1)[0]?.id).toBe("b");
  });

  it("breaks ties between equivalent instants by id", () => {
    const entries = [
      { id: "b", value: 81, local_date: "2026-11-15", measured_at: "2026-11-15T08:00:00Z" },
      { id: "a", value: 80, local_date: "2026-11-15", measured_at: "2026-11-15T13:30:00+05:30" },
    ];
    expect(lastN(entries, 2).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("writes nothing when a draft is reverted to its baseline", () => {
    expect(changedCanonical("80.0", "80.0", (v) => v)).toBeUndefined();
    expect(changedCanonical("80", "80.0", (v) => v)).toBeUndefined();
    expect(changedCanonical("81.0", "80.0", (v) => v)).toBe(81);
  });

  it("keeps a precise stored height when the shown inches are saved untouched", () => {
    const shown = cmToIn(180).toFixed(1);
    expect(changedCanonical(shown, shown, inToCm)).toBeUndefined();
  });

  it("formats body values to exactly one decimal in the reader's locale", () => {
    expect(formatBodyValue(80, "en")).toBe("80.0");
    expect(formatBodyValue(80.26, "en")).toBe("80.3");
    expect(formatBodyValue(80.5, "de")).toBe("80,5");
  });
});
