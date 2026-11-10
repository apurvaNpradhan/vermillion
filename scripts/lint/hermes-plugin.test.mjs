import { describe, expect, test } from "vitest";
import plugin from "./hermes-plugin.mjs";

const rule = plugin.rules["no-es2023-array-methods"];

/** Reports for a member access `object.name` (or `object[name]` when computed). */
function check(name, computed = false) {
  const reports = [];
  const handlers = rule.create({ report: (report) => reports.push(report.message) });
  handlers.MemberExpression({
    computed,
    property: computed ? { type: "Literal", value: name } : { type: "Identifier", name },
  });
  return reports;
}

describe("hermes/no-es2023-array-methods", () => {
  test("reports the methods Hermes lacks", () => {
    for (const name of ["toSorted", "toReversed", "toSpliced", "findLast", "findLastIndex"])
      expect(check(name)).toHaveLength(1);
  });

  test("allows the mutating and forward methods", () => {
    for (const name of ["sort", "reverse", "splice", "find", "findIndex"])
      expect(check(name)).toEqual([]);
  });

  test("ignores computed access", () => {
    expect(check("toSorted", true)).toEqual([]);
  });
});
