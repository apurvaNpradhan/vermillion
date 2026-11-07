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
    expect(check(from, "../notes")).toEqual([]);
    expect(check(from, "../notes/index")).toEqual([]);
    expect(check(from, "../notes/index.ts")).toEqual([]);
  });

  test("reaching into another vertical's internals is reported", () => {
    const reports = check(from, "../notes/delete-note");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(/"notes" vertical/);
  });

  test("a vertical may import its own files, platform is shared", () => {
    expect(check(from, "./export")).toEqual([]);
    expect(check(from, "../platform/orpc/base")).toEqual([]);
  });

  test("files at the tree root use indexes too", () => {
    expect(check("packages/api/src/index.ts", "./notes/tables")).toHaveLength(1);
    expect(check("packages/api/src/index.ts", "./notes")).toEqual([]);
  });

  test("table files may import each other, and platform assembles them", () => {
    expect(check("packages/api/src/notes/tables.ts", "../auth/tables")).toEqual([]);
    expect(check("packages/api/src/platform/database/schema.ts", "../../auth/tables")).toEqual([]);
    expect(check("packages/api/src/notes/list.ts", "../auth/tables")).toHaveLength(1);
  });

  test("re-exports, dynamic imports and packages are handled", () => {
    expect(
      check("packages/api/src/notes/index.ts", "../auth/config", "ExportNamedDeclaration"),
    ).toHaveLength(1);
    expect(check(from, "../notes/x", "ImportExpression")).toHaveLength(1);
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
    expect(check("packages/api/src/account/a.test.ts", "../notes/x")).toEqual([]);
  });
});

describe("apps/web", () => {
  const from = "apps/web/src/preferences/use-preferences.ts";

  test("the @/ alias is checked like a relative import", () => {
    expect(check(from, "@/account")).toEqual([]);
    expect(check(from, "@/account/use-delete-account")).toHaveLength(1);
    expect(check(from, "@/platform/orpc")).toEqual([]);
    expect(check(from, "@/preferences/schema")).toEqual([]);
  });

  test("routes and shared folders are not verticals", () => {
    expect(check("apps/web/src/routes/login.tsx", "@/account/use-session")).toHaveLength(1);
    expect(check("apps/web/src/routes/login.tsx", "@/account")).toEqual([]);
    expect(check(from, "@/lib/seo")).toEqual([]);
    expect(check("apps/web/src/lib/seo/index.ts", "@/platform/env")).toEqual([]);
    expect(check("apps/web/src/lib/seo/index.ts", "@/auth/session")).toHaveLength(1);
    // Former exempt folders are verticals now: reach them through their index.
    expect(check(from, "@/components/header")).toHaveLength(1);
  });
});

describe("apps/native", () => {
  const from = "apps/native/src/notes/note-list.tsx";

  test("@/ points at src, so modules go through their indexes", () => {
    expect(check(from, "@/account")).toEqual([]);
    expect(check(from, "@/account/session")).toHaveLength(1);
    expect(check(from, "@/platform/storage")).toEqual([]);
  });

  test("files at the tree root go through indexes", () => {
    expect(check("apps/native/src/index.ts", "./account/session")).toHaveLength(1);
  });

  test("the web alias does not apply to native files", () => {
    expect(check("apps/web/src/auth/sign-in.tsx", "@/account/session")).toHaveLength(1);
  });
});
