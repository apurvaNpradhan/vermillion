import { expect, it } from "vitest";
import { createI18n } from "@workspace/i18n";
import { historyFormat } from "../../session/history/history-format";

it("formats English labels and History lists when Hermes lacks Intl formatters", async () => {
  const original = Object.getOwnPropertyDescriptor(Intl, "PluralRules");
  const originalList = Object.getOwnPropertyDescriptor(Intl, "ListFormat");
  Object.defineProperty(Intl, "PluralRules", { configurable: true, value: undefined });
  Object.defineProperty(Intl, "ListFormat", { configurable: true, value: undefined });
  try {
    await import("./polyfills");
    const t = createI18n("en").getFixedT("en");
    expect(t("stats__sets", { count: 1 })).toBe("1 set");
    expect(t("stats__sets", { count: 2 })).toBe("2 sets");
    expect(t("stats__sets", { count: 0 })).toBe("0 sets");
    const format = historyFormat("en", "kg");
    expect(format.list([])).toBe("");
    expect(format.list(["January"])).toBe("January");
    expect(format.list(["January", "February"])).toBe("January and February");
    expect(format.list(["January", "February", "March"])).toBe("January, February, and March");
  } finally {
    if (original) Object.defineProperty(Intl, "PluralRules", original);
    if (originalList) Object.defineProperty(Intl, "ListFormat", originalList);
  }
});
