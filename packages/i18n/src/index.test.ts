import { describe, expect, it } from "vitest";

import { getT, resources } from "./index";

const keys = (locale: "en" | "de") => Object.keys(resources[locale].translation).toSorted();

describe("server translations", () => {
  it("has the same keys in every language", () => {
    expect(keys("de")).toEqual(keys("en"));
  });
  it("names keys feature__identifier", () => {
    for (const key of keys("en")) expect(key).toMatch(/^[a-z]+__[a-z_]+$/);
  });
  it("translates, interpolates and falls back to English", () => {
    expect(getT("de")("emails__verification_action")).toBe("E-Mail bestätigen");
    expect(getT("en")("emails__verification_subject", { app: "Acme" })).toBe(
      "Verify your email for Acme",
    );
    expect(getT("fr")("emails__verification_action")).toBe("Verify email");
  });
  it("pluralises", () => {
    expect(getT("en")("emails__link_expiry", { count: 1 })).toBe("This link expires in 1 hour.");
    expect(getT("de")("emails__link_expiry", { count: 2 })).toBe(
      "Dieser Link läuft in 2 Stunden ab.",
    );
  });
});
