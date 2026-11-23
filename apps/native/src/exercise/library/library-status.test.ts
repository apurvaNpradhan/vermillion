import { describe, expect, it } from "vitest";

import { catalogState, libraryStatus, type CatalogSnapshot } from "./library-status";

const snapshot = (
  indicator: "connected" | "uploading" | "paused" | "locked" | "update-required",
  catalogSynced: boolean,
  kind: "active" | "starting" = "active",
): CatalogSnapshot => ({
  phase: kind === "active" ? { kind: "active", owner: "u" } : { kind: "starting" },
  indicator,
  catalogSynced,
});

describe("library status", () => {
  it("is an error whenever a read failed", () => {
    expect(
      libraryStatus({
        failed: true,
        catalog: catalogState(snapshot("connected", true)),
        show: "all",
      }),
    ).toBe("error");
  });

  it("is ready once the catalog has synced, connected or not", () => {
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("connected", true)),
        show: "all",
      }),
    ).toBe("ready");
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("paused", true)),
        show: "all",
      }),
    ).toBe("ready");
  });

  it("is first-sync while the catalog downloads", () => {
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("connected", false)),
        show: "all",
      }),
    ).toBe("first-sync");
    expect(libraryStatus({ failed: false, catalog: catalogState(null), show: "all" })).toBe(
      "first-sync",
    );
  });

  it("is offline-unsynced when disconnected before the first sync", () => {
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("paused", false)),
        show: "all",
      }),
    ).toBe("offline-unsynced");
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("locked", false)),
        show: "all",
      }),
    ).toBe("offline-unsynced");
  });

  it("does not call the start of the app offline", () => {
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("paused", false, "starting")),
        show: "all",
      }),
    ).toBe("first-sync");
  });

  it("does not make Custom or archived lists wait for the catalog", () => {
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("paused", false)),
        show: "custom",
      }),
    ).toBe("ready");
    expect(
      libraryStatus({
        failed: false,
        catalog: catalogState(snapshot("connected", false)),
        show: "archived",
      }),
    ).toBe("ready");
  });
});
