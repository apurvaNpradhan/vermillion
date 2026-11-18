import { describe, expect, it } from "vitest";

import { combineStatus, isFirstSync, trainStatus } from "./train-status";

const active = { kind: "active", owner: "a" } as const;
const base = { failed: false, loading: false, count: 0, online: true };

describe("trainStatus", () => {
  it("tells the five states apart", () => {
    const syncing = { hasSynced: false, indicator: "connected", phase: active } as const;
    const synced = { hasSynced: true, indicator: "connected", phase: active } as const;
    expect(trainStatus({ ...base, failed: true, snapshot: synced })).toBe("error");
    expect(trainStatus({ ...base, loading: true, snapshot: synced })).toBe("loading");
    expect(trainStatus({ ...base, snapshot: syncing })).toBe("first-sync");
    expect(trainStatus({ ...base, snapshot: synced })).toBe("empty");
    expect(trainStatus({ ...base, count: 2, snapshot: syncing })).toBe("list");
  });

  it("does not wait for a sync that cannot happen", () => {
    expect(
      trainStatus({ ...base, snapshot: { hasSynced: false, indicator: "locked", phase: active } }),
    ).toBe("empty");
  });

  it("says the first download needs a connection while the device is offline", () => {
    const offline = { hasSynced: false, indicator: "paused", phase: active } as const;
    expect(trainStatus({ ...base, online: false, snapshot: offline })).toBe("first-sync-offline");
    // PowerSync still handshaking while the server is reachable is the normal first sync.
    expect(trainStatus({ ...base, snapshot: offline })).toBe("first-sync");
    expect(isFirstSync("first-sync-offline")).toBe(true);
    expect(isFirstSync("first-sync")).toBe(true);
    expect(isFirstSync("empty")).toBe(false);
    // Before the account is known nothing has been tried: still just setting up.
    expect(
      trainStatus({
        ...base,
        online: false,
        snapshot: { ...offline, phase: { kind: "starting" } },
      }),
    ).toBe("first-sync");
    // Data that is already on the device is shown, offline or not.
    expect(trainStatus({ ...base, online: false, count: 1, snapshot: offline })).toBe("list");
  });
});

describe("combineStatus", () => {
  it("lets an error win, then loading, then a list, then the first sync", () => {
    expect(combineStatus("error", "list")).toBe("error");
    expect(combineStatus("list", "loading")).toBe("loading");
    expect(combineStatus("empty", "list")).toBe("list");
    expect(combineStatus("first-sync", "empty")).toBe("first-sync");
    expect(combineStatus("first-sync", "first-sync-offline")).toBe("first-sync-offline");
    expect(combineStatus("empty", "empty")).toBe("empty");
  });
});
