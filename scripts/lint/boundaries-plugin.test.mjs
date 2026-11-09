import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import plugin from "./boundaries-plugin.mjs";

const root = resolve(import.meta.dirname, "../..");
const rule = plugin.rules["vertical-boundaries"];

/** Reports produced by importing `specifier` from `file` (repo-relative). */
function check(file, specifier, visitor = "ImportDeclaration") {
  const reports = [];
  const handlers = rule.create({
    filename: join(root, file),
    report: (report) => reports.push(report.message),
  });
  handlers[visitor]?.({ source: { value: specifier, type: "Literal" } });
  return reports;
}

describe("packages/api", () => {
  const from = "packages/api/src/account/delete.ts";

  test("another vertical is reachable through its index", () => {
    expect(check(from, "../exercise")).toEqual([]);
    expect(check(from, "../exercise/index")).toEqual([]);
    expect(check(from, "../exercise/index.ts")).toEqual([]);
  });

  test("reaching into another vertical's internals is reported", () => {
    const reports = check(from, "../exercise/delete-exercise");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(/"exercise" vertical/);
  });

  test("a vertical may import its own files, platform is shared", () => {
    expect(check(from, "./export")).toEqual([]);
    expect(check(from, "../platform/orpc/base")).toEqual([]);
  });

  test("files at the tree root use indexes too", () => {
    expect(check("packages/api/src/index.ts", "./exercise/tables")).toHaveLength(1);
    expect(check("packages/api/src/index.ts", "./exercise")).toEqual([]);
  });

  test("table files may import each other, and platform assembles them", () => {
    expect(check("packages/api/src/exercise/tables.ts", "../auth/tables")).toEqual([]);
    expect(check("packages/api/src/platform/database/schema.ts", "../../auth/tables")).toEqual([]);
    expect(check("packages/api/src/exercise/list.ts", "../auth/tables")).toHaveLength(1);
  });

  test("re-exports, dynamic imports and packages are handled", () => {
    expect(
      check("packages/api/src/exercise/index.ts", "../auth/config", "ExportNamedDeclaration"),
    ).toHaveLength(1);
    expect(check(from, "../exercise/x", "ImportExpression")).toHaveLength(1);
    expect(check(from, "zod")).toEqual([]);

    // `export const x = 1` has no source and is not an import.
    const reports = [];
    const handlers = rule.create({
      filename: join(root, from),
      report: (report) => reports.push(report),
    });
    handlers.ExportNamedDeclaration({ source: null });
    expect(reports).toEqual([]);
  });

  test("tests are exempt", () => {
    expect(check("packages/api/src/account/a.test.ts", "../exercise/x")).toEqual([]);
  });
});

describe("apps/native", () => {
  const from = "apps/native/src/exercise/exercise-list.tsx";

  test("@/ points at src, so modules go through their indexes", () => {
    expect(check(from, "@/account")).toEqual([]);
    expect(check(from, "@/account/session")).toHaveLength(1);
    expect(check(from, "@/platform/storage")).toEqual([]);
  });

  test("files at the tree root go through indexes", () => {
    expect(check("apps/native/src/index.ts", "./account/session")).toHaveLength(1);
  });
});

describe("packages/sync", () => {
  test("forbids server packages and the pg schema layer", () => {
    const from = "packages/sync/src/exercise/tables.ts";
    expect(check(from, "@workspace/db/schema/auth")).toHaveLength(1);
    expect(check(from, "@workspace/api")).toHaveLength(1);
    expect(check(from, "drizzle-orm/pg-core")).toHaveLength(1);
    expect(check(from, "drizzle-orm/sqlite-core")).toEqual([]);
    expect(check("apps/native/src/exercise/x.ts", "@workspace/db/columns")).toEqual([]);
  });

  test("verticals reach each other through the index", () => {
    expect(check("packages/sync/src/platform/schema.ts", "../exercise")).toEqual([]);
    expect(check("packages/sync/src/platform/schema.ts", "../exercise/tables")).toHaveLength(0);
  });
});
