import { describe, expect, test } from "vitest";
import {
  findCycles,
  moduleLevelCalls,
  runtimeImports,
  strip,
  withoutFunctions,
} from "./check-vertical-cycles.mjs";

const calls = (source, names) => moduleLevelCalls(strip(source).bare, names);

describe("runtime imports", () => {
  test("keeps value imports and their local names", () => {
    const source = [
      'import Default, { a, b as c, type T } from "@/session";',
      'import * as body from "@/body";',
      'export { d } from "@/training";',
      'const lazy = () => import("@/share");',
    ].join("\n");
    expect(runtimeImports(strip(source).code)).toEqual([
      { from: "@/session", names: ["Default", "a", "c"] },
      { from: "@/body", names: ["body"] },
      { from: "@/training", names: [] },
      { from: "@/share", names: [] },
    ]);
  });

  test("ignores type-only imports and commented-out imports", () => {
    const source = [
      'import type { A } from "@/session";',
      'import { type B, type C } from "@/body";',
      'export type { D } from "@/training";',
      '// import { e } from "@/share";',
    ].join("\n");
    expect(runtimeImports(strip(source).code)).toEqual([]);
  });
});

describe("module-level calls", () => {
  test("flags a call that runs while the file loads", () => {
    const source = [
      'import { make, Store, tag } from "@/session";',
      "const shared = make();",
      "export const table = { first: make({ a: 1 }) };",
      "const store = new Store();",
      "const member = Store.create<string>();",
      "make();",
    ].join("\n");
    expect(calls(source, ["make", "Store", "tag"])).toEqual([
      { name: "make", line: 2 },
      { name: "make", line: 3 },
      { name: "Store", line: 4 },
      { name: "Store", line: 5 },
      { name: "make", line: 6 },
    ]);
  });

  test("allows calls inside functions, references and text", () => {
    const source = [
      "const lazy = () => (shared ??= make());",
      "const block = () => {",
      "  return make();",
      "};",
      "export function Component() {",
      "  const value = make();",
      "  return value;",
      "}",
      "const object = {",
      "  method(input): string {",
      "    return make(input);",
      "  },",
      "  arrow: (input) => make(input),",
      "};",
      "export const Wrapped = memo(function Inner() {",
      "  return make();",
      "});",
      "const reference = wrap(make);",
      'const text = "make()";',
      "// make();",
      "const own = other.make();",
      "class Thing {",
      "  value = make();",
      "}",
    ].join("\n");
    expect(calls(source, ["make"])).toEqual([]);
  });

  test("sees a call in a template literal and after an arrow body ends", () => {
    const source = ["const text = `a ${make()} b`;", "const pair = [() => 1, make()];"].join("\n");
    expect(calls(source, ["make"])).toEqual([
      { name: "make", line: 1 },
      { name: "make", line: 2 },
    ]);
  });

  test("keeps the code of a top-level control statement", () => {
    expect(withoutFunctions("if (flag) {\n  make();\n}")).toContain("make()");
  });
});

describe("cycles", () => {
  test("reports each cycle once", () => {
    const graph = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["a", "c"])],
      ["c", new Set(["a"])],
      ["d", new Set(["a"])],
    ]);
    expect(findCycles(graph)).toEqual([
      ["a", "b"],
      ["a", "b", "c"],
    ]);
  });
});
