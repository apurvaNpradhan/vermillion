import { describe, expect, it } from "vitest";

import { compareVersions, semverSchema, updateDecision, versionFromTag } from "./release";

const latest = (version: string) => ({
  version,
  url: "https://example.com/app.apk",
  publishedAt: "2026-11-17T00:00:00Z",
});

describe("compareVersions", () => {
  it("orders by major, minor and patch numerically", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("ranks a pre-release below its release", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
  });

  it("answers null for something that is not a version", () => {
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
    expect(compareVersions("latest", "1.0.0")).toBeNull();
  });
});

describe("semverSchema and tags", () => {
  it("accepts versions and refuses the rest", () => {
    expect(semverSchema.safeParse("1.2.3").success).toBe(true);
    expect(semverSchema.safeParse("1.2.3-rc.1").success).toBe(true);
    expect(semverSchema.safeParse("v1.2.3").success).toBe(false);
    expect(semverSchema.safeParse("01.2.3").success).toBe(false);
  });

  it("reads a version from a release tag", () => {
    expect(versionFromTag("v1.4.0")).toBe("1.4.0");
    expect(versionFromTag("nightly")).toBeNull();
  });
});

describe("updateDecision", () => {
  it("requires an update below the minimum", () => {
    expect(updateDecision("1.0.0", { minimumVersion: "1.1.0", latest: latest("1.2.0") })).toBe(
      "required",
    );
  });

  it("offers an update below the latest release", () => {
    expect(updateDecision("1.1.0", { minimumVersion: "1.0.0", latest: latest("1.2.0") })).toBe(
      "available",
    );
  });

  it("says nothing when current, unknown or not a version", () => {
    expect(updateDecision("1.2.0", { minimumVersion: "1.0.0", latest: latest("1.2.0") })).toBe(
      "none",
    );
    expect(updateDecision("1.0.0", null)).toBe("none");
    expect(updateDecision("1.0.0", { minimumVersion: null, latest: null })).toBe("none");
    expect(updateDecision("dev", { minimumVersion: "1.0.0", latest: latest("2.0.0") })).toBe(
      "none",
    );
  });
});
