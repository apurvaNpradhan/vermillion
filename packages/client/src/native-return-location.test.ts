import { describe, expect, it } from "vitest";

import { captureNativeReturnLocation, nativeReturnLocation } from "./native-return-location";

describe("native return destinations", () => {
  it.each(["exercises", "settings/profile", "body/weight", "body/measurements"])(
    "preserves %s through authentication",
    (path) => {
      expect(nativeReturnLocation(`app://${path}`, "app")?.pathname).toBe(`/${path}`);
      expect(nativeReturnLocation(`app:///${path}`, "app")?.pathname).toBe(`/${path}`);
      expect(nativeReturnLocation(`exp://192.168.1.2:8081/--/${path}`, "app")?.pathname).toBe(
        `/${path}`,
      );
    },
  );
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

  it("keeps the reminder sheet parameter through authentication", () => {
    expect(nativeReturnLocation("app://body/weight?reminder=1", "app")).toEqual({
      pathname: "/body/weight",
      params: { reminder: "1" },
    });
  });
  it("keeps a deletion confirmation token in the internal destination", () => {
    expect(nativeReturnLocation("app://confirm-deletion?token=abc", "app")).toEqual({
      pathname: "/confirm-deletion",
      params: { token: "abc" },
    });
  });
  it("returns a Share link opened signed out to its import preview", () => {
    const site = "sigil.lostsignal.cloud";
    expect(nativeReturnLocation(`https://${site}/p/k7qm2x`, "app", site)).toEqual({
      pathname: "/p/[code]",
      params: { code: "K7QM2X" },
    });
    expect(nativeReturnLocation(`https://${site}/w/K7QM2X/`, "app", site)).toEqual({
      pathname: "/w/[code]",
      params: { code: "K7QM2X" },
    });
    expect(captureNativeReturnLocation(null, `https://${site}/p/K7QM2X`, "app", site)).toEqual({
      pathname: "/p/[code]",
      params: { code: "K7QM2X" },
    });
  });
  it.each([
    "https://evil.example/p/K7QM2X",
    "https://sigil.lostsignal.cloud/p/short",
    "https://sigil.lostsignal.cloud/x/K7QM2X",
    "https://sigil.lostsignal.cloud/p/K7QM2X/more",
    "https://user@sigil.lostsignal.cloud/p/K7QM2X",
    "http://sigil.lostsignal.cloud/p/K7QM2X",
  ])("rejects the Share link %s", (value) => {
    expect(nativeReturnLocation(value, "app", "sigil.lostsignal.cloud")).toBeNull();
  });
  it("accepts no site link when no site host is given", () => {
    expect(nativeReturnLocation("https://sigil.lostsignal.cloud/p/K7QM2X", "app")).toBeNull();
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
