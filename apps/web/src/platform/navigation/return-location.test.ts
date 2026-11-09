import { describe, expect, it } from "vitest";

import { DEFAULT_RETURN_LOCATION, safeReturnLocation } from "./return-location";

describe("safeReturnLocation", () => {
  it("accepts in-app paths with search and hash", () => {
    expect(safeReturnLocation("/app")).toBe("/app");
    expect(safeReturnLocation("/settings/preferences?tab=1#top")).toBe(
      "/settings/preferences?tab=1#top",
    );
    expect(safeReturnLocation("/admin/users?page=2")).toBe("/admin/users?page=2");
  });

  it.each([
    "https://evil.example/app",
    "http://evil.example",
    "//evil.example/app",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "app",
    "",
    "/app\n//evil.example",
    "/app\u0000",
    "/ap\\p",
  ])("refuses %j", (raw) => {
    expect(safeReturnLocation(raw)).toBe(DEFAULT_RETURN_LOCATION);
  });

  it("never returns to an auth page", () => {
    expect(safeReturnLocation("/login")).toBe(DEFAULT_RETURN_LOCATION);
    expect(safeReturnLocation("/login/?redirect=/app")).toBe(DEFAULT_RETURN_LOCATION);
    expect(safeReturnLocation("/verify-code?email=a@b.c")).toBe(DEFAULT_RETURN_LOCATION);
    expect(safeReturnLocation("/onboarding")).toBe(DEFAULT_RETURN_LOCATION);
  });

  it("treats non-strings and oversized input as invalid and honours the fallback", () => {
    expect(safeReturnLocation(undefined)).toBe(DEFAULT_RETURN_LOCATION);
    expect(safeReturnLocation(Number(42) as unknown as string)).toBe(DEFAULT_RETURN_LOCATION);
    expect(safeReturnLocation(`/${"a".repeat(3000)}`)).toBe(DEFAULT_RETURN_LOCATION);
    expect(safeReturnLocation("//x", "/home")).toBe("/home");
  });

  it("cannot be steered off-origin by encoded or dotted segments", () => {
    const result = safeReturnLocation("/%2F%2Fevil.example/../../");
    expect(new URL(result, "http://app.test").origin).toBe("http://app.test");
  });
});
