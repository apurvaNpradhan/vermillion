import { describe, expect, it } from "vitest";

import {
  isLocale,
  localeSchema,
  parseAcceptLanguage,
  readCookie,
  resolveLocale,
  storedLocaleSchema,
  SUPPORTED_LOCALES,
} from "./locale";

describe("supported locales", () => {
  it("only accepts English", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en"]);
    expect(isLocale("en")).toBe(true);
    for (const locale of ["de", "fr", "es"]) {
      expect(isLocale(locale)).toBe(false);
      expect(localeSchema.safeParse(locale).success).toBe(false);
    }
  });
});

describe("stored locales", () => {
  it("read as English when no longer supported, and never fail", () => {
    expect(storedLocaleSchema.parse("de")).toBe("en");
    expect(storedLocaleSchema.parse(undefined)).toBe("en");
    expect(storedLocaleSchema.parse("en")).toBe("en");
  });
});

describe("Accept-Language", () => {
  it("selects English even when unsupported languages have higher weights", () => {
    expect(parseAcceptLanguage("fr-FR,de-AT;q=0.8,en;q=0.5")).toBe("en");
    expect(parseAcceptLanguage("en-GB;q=0.2, de;q=0.9")).toBe("en");
  });
  it("skips unsupported and zero-weight languages", () => {
    expect(parseAcceptLanguage("de, fr, es")).toBeUndefined();
    expect(parseAcceptLanguage("en;q=0, de;q=0.1")).toBeUndefined();
    expect(parseAcceptLanguage("de;q=0, en;q=0.1")).toBe("en");
  });
  it("tolerates garbage", () => {
    expect(parseAcceptLanguage(";;;, ,q=")).toBeUndefined();
    expect(parseAcceptLanguage(null)).toBeUndefined();
  });
});

describe("locale resolution", () => {
  it("falls back to English for old preferences, cookies and unsupported device languages", () => {
    expect(resolveLocale({ saved: "de", cookie: "de", acceptLanguage: "de-DE" })).toBe("en");
    expect(resolveLocale({ saved: null, cookie: "de", acceptLanguage: "en" })).toBe("en");
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "fr-FR" })).toBe("en");
    expect(resolveLocale({ saved: "en" })).toBe("en");
    expect(resolveLocale({})).toBe("en");
  });
});

describe("readCookie", () => {
  it("finds a cookie by exact name", () => {
    expect(readCookie("a=1; locale=en; b=2", "locale")).toBe("en");
    expect(readCookie("xlocale=en", "locale")).toBeUndefined();
    expect(readCookie(null, "locale")).toBeUndefined();
  });
});
