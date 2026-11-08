import { describe, expect, it } from "vitest";

import { parseAcceptLanguage, readCookie, resolveLocale } from "./locale";

describe("Accept-Language", () => {
  it("honours q-values and ignores regions", () => {
    expect(parseAcceptLanguage("fr-FR,de-AT;q=0.8,en;q=0.5")).toBe("de");
    expect(parseAcceptLanguage("en;q=0.2, de;q=0.9")).toBe("de");
  });
  it("preserves header order when weights are equal", () => {
    expect(parseAcceptLanguage("de;q=0.8, en;q=0.8")).toBe("de");
    expect(parseAcceptLanguage("en;q=0.8, de;q=0.8")).toBe("en");
  });
  it("skips unsupported and zero-weight languages", () => {
    expect(parseAcceptLanguage("fr, es")).toBeUndefined();
    expect(parseAcceptLanguage("de;q=0, en;q=0.1")).toBe("en");
  });
  it("tolerates garbage", () => {
    expect(parseAcceptLanguage(";;;, ,q=")).toBeUndefined();
    expect(parseAcceptLanguage(null)).toBeUndefined();
  });
});

describe("locale resolution order", () => {
  it("prefers the saved preference, then the cookie, then the header, then English", () => {
    expect(resolveLocale({ saved: "de", cookie: "en", acceptLanguage: "en" })).toBe("de");
    expect(resolveLocale({ saved: null, cookie: "de", acceptLanguage: "en" })).toBe("de");
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "de-DE" })).toBe("de");
    expect(resolveLocale({})).toBe("en");
  });
});

describe("readCookie", () => {
  it("finds a cookie by exact name", () => {
    expect(readCookie("a=1; locale=de; b=2", "locale")).toBe("de");
    expect(readCookie("xlocale=de", "locale")).toBeUndefined();
    expect(readCookie(null, "locale")).toBeUndefined();
  });
});
