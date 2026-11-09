import { describe, expect, it } from "vitest";

import { createI18n, getT, resources } from "./index";

describe("server translations", () => {
  it("only ships English", () => {
    expect(Object.keys(resources)).toEqual(["en"]);
  });
  it("names keys feature__identifier", () => {
    for (const key of Object.keys(resources.en.translation))
      expect(key).toMatch(/^[a-z]+__[a-z_]+$/);
  });
  it("translates, interpolates and falls back to English", () => {
    expect(getT("en")("emails__sign_in_code_subject", { app: "Acme", code: "123456" })).toBe(
      "123456 is your Acme code",
    );
    for (const locale of ["de", "fr"]) {
      expect(getT(locale)("emails__deletion_action")).toBe("Delete my account");
      expect(createI18n(locale).resolvedLanguage).toBe("en");
    }
  });
  it("pluralises", () => {
    expect(getT("en")("emails__link_expiry", { count: 1 })).toBe("This link expires in 1 hour.");
    expect(getT("en")("emails__link_expiry", { count: 2 })).toBe("This link expires in 2 hours.");
  });
});
