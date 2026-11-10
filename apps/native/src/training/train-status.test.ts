import { describe, expect, it } from "vitest";

import { trainStatus } from "./train-status";

const base = { failed: false, loading: false, count: 0 };

describe("trainStatus", () => {
  it("tells the five states apart", () => {
    const syncing = { hasSynced: false, indicator: "connected" } as const;
    const synced = { hasSynced: true, indicator: "connected" } as const;
    expect(trainStatus({ ...base, failed: true, snapshot: synced })).toBe("error");
    expect(trainStatus({ ...base, loading: true, snapshot: synced })).toBe("loading");
    expect(trainStatus({ ...base, snapshot: syncing })).toBe("first-sync");
    expect(trainStatus({ ...base, snapshot: synced })).toBe("empty");
    expect(trainStatus({ ...base, count: 2, snapshot: syncing })).toBe("list");
  });

  it("does not wait for a sync that cannot happen", () => {
    expect(trainStatus({ ...base, snapshot: { hasSynced: false, indicator: "locked" } })).toBe(
      "empty",
    );
  });
});
