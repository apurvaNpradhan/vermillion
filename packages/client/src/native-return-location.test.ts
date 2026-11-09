import { describe, expect, it } from "vitest";

import { captureNativeReturnLocation, nativeReturnLocation } from "./native-return-location";

describe("native return destinations", () => {
  it.each(["exercises", "settings/profile"])("preserves %s through authentication", (path) => {
    expect(nativeReturnLocation(`app://${path}`, "app")?.pathname).toBe(`/${path}`);
    expect(nativeReturnLocation(`app:///${path}`, "app")?.pathname).toBe(`/${path}`);
    expect(nativeReturnLocation(`exp://192.168.1.2:8081/--/${path}`, "app")?.pathname).toBe(
      `/${path}`,
    );
  });
  it.each(["app:///?cookie=private-session", "app:///", "app://sign-in?error=access_denied"])(
    "preserves a pending destination through OAuth callback %s",
    (callback) => {
      for (const link of ["app://exercises", "app://confirm-deletion?token=abc"]) {
        const pending = captureNativeReturnLocation(null, link, "app");
        expect(pending).not.toBeNull();
        expect(captureNativeReturnLocation(pending, callback, "app")).toEqual(pending);
      }
      expect(nativeReturnLocation("app:///?cookie=private-session", "app")).toBeNull();
    },
  );

  it("keeps a deletion confirmation token in the internal destination", () => {
    expect(nativeReturnLocation("app://confirm-deletion?token=abc", "app")).toEqual({
      pathname: "/confirm-deletion",
      params: { token: "abc" },
    });
  });
  it.each([
    "https://evil.example/exercises",
    "other://exercises",
    "app://evil@exercises",
    "app://login",
    "app://%2f%2fevil",
    null,
  ])("rejects %s", (value) => {
    expect(nativeReturnLocation(value, "app")).toBeNull();
  });
});
