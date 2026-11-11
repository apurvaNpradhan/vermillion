import { expect, it } from "vitest";
import { createI18n } from "@workspace/i18n";

it("selects English singular and plural labels when Hermes has no PluralRules", async () => {
  const original = Object.getOwnPropertyDescriptor(Intl, "PluralRules");
  Object.defineProperty(Intl, "PluralRules", { configurable: true, value: undefined });
  try {
    await import("./polyfills");
    const t = createI18n("en").getFixedT("en");
    expect(t("stats__sets", { count: 1 })).toBe("1 set");
    expect(t("stats__sets", { count: 2 })).toBe("2 sets");
    expect(t("stats__sets", { count: 0 })).toBe("0 sets");
  } finally {
    if (original) Object.defineProperty(Intl, "PluralRules", original);
  }
});
