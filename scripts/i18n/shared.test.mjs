import { describe, expect, test } from "vitest";

import { compareLocale, pluralBase, placeholders } from "./shared.mjs";

const reference = {
  common__save: "Save",
  admin__total_one: "{{count}} user",
  admin__total_other: "{{count}} users",
  emails__greeting: "Hi {{name}},",
};

describe("compareLocale", () => {
  test("accepts a complete locale", () => {
    const result = compareLocale(reference, { ...reference, common__save: "Speichern" }, "de");
    expect([
      ...result.missing,
      ...result.extra,
      ...result.badNames,
      ...result.variableMismatches,
    ]).toEqual([]);
  });

  test("finds missing and extra keys", () => {
    const { common__save: _omitted, ...rest } = reference;
    const result = compareLocale(reference, { ...rest, common__extra: "x" }, "de");
    expect([...result.missing]).toEqual(["common__save"]);
    expect([...result.extra]).toEqual(["common__extra"]);
  });

  test("demands the plural forms of the language", () => {
    // Polish needs one/few/many/other.
    const result = compareLocale(reference, { ...reference }, "pl");
    expect([...result.missing].toSorted()).toEqual(["admin__total_few", "admin__total_many"]);
  });

  test("accepts the plural forms a language needs that English lacks", () => {
    const polish = { ...reference, admin__total_few: "x", admin__total_many: "y" };
    expect([...compareLocale(reference, polish, "pl").extra]).toEqual([]);
  });

  test("flags a changed variable and a bad key name", () => {
    const result = compareLocale(
      reference,
      { ...reference, emails__greeting: "Hallo {{vorname}},", "Bad-Key": "x" },
      "de",
    );
    expect(result.variableMismatches).toEqual(["emails__greeting"]);
    expect(result.badNames).toEqual(["Bad-Key"]);
  });
});

test("helpers", () => {
  expect(pluralBase("admin__total_other")).toBe("admin__total");
  expect(pluralBase("common__save")).toBeNull();
  expect([...placeholders("Hi {{ name }}, {{count}}")]).toEqual(["name", "count"]);
});
