import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { uuidv7 } from "@workspace/db/columns";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createFullAdmin, fakeNetwork } from "../../platform/testing/admin";
import { createTestApp, type TestApp } from "../../platform/testing/harness";
import { bundledCatalogText } from "../operations/bundled-catalog";
import { seedCatalog } from "../operations/seed-catalog";
import { applyBundledPatches, applyCatalogPatches, type PatchSource } from "./apply-patches";
import { bundledPatches, bundledPatchesFolder } from "./bundled-patches";
import { CatalogPatchError, parsePatchFile } from "./patch-file";

const ADMIN = "owner@example.com";

type Fixture = {
  requires_app_version?: string;
  insert?: ReturnType<typeof newRow>[];
  fill?: {
    id: string;
    rank?: number;
    instructions?: string;
    primary_detail?: string[];
    secondary_detail?: string[];
    secondary_muscles?: string[];
  }[];
  change?: { id: string; field: string; from: string | string[]; to: string | string[] }[];
};

const source = (name: string, patch: Fixture): PatchSource => ({
  name,
  text: JSON.stringify(patch),
});

const newRow = (title: string) => ({
  id: uuidv7(),
  title,
  primary_muscle: "shoulders",
  secondary_muscles: ["chest"],
  primary_detail: ["side_delts"],
  secondary_detail: ["upper_chest"],
  equipment: "cable",
  exercise_type: "weight_reps",
  is_full_bodyweight: false,
  rank: 40,
  search_terms: null,
  aka: null,
  instructions: "Raise it.",
  video_key: null,
  thumbnail_key: "exercises/v2/new.webp",
});

describe("Catalog patches (seam 1)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({
      config: { adminEmails: [ADMIN] },
      fetch: fakeNetwork({}).fetch,
    });
  }, 60_000);
  afterAll(async () => app?.close());

  /** A fresh catalog every test: the seed, then the rows the test reads are put in a known state. */
  beforeEach(async () => {
    await app.rows(sql`DELETE FROM reference_import`);
    await app.rows(sql`DELETE FROM exercise WHERE user_id IS NULL`);
    await seedCatalog(app.services.db, bundledCatalogText());
  });
  afterEach(async () => {
    await app.rows(sql`DELETE FROM app_setting WHERE key = 'minimum_app_version'`);
  });

  const db = () => app.services.db;
  const row = async (id: string) =>
    (
      await app.rows(
        sql`SELECT title, primary_muscle, equipment, rank, instructions, retired_at,
              to_json(primary_detail)::text AS primary_detail, to_json(secondary_muscles)::text AS secondary_muscles
            FROM exercise WHERE id = ${id}`,
      )
    )[0];
  const count = async () =>
    Number((await app.rows(sql`SELECT count(*) AS n FROM exercise WHERE user_id IS NULL`))[0]?.n);
  const recorded = async () =>
    (await app.rows(sql`SELECT catalog FROM reference_import WHERE catalog LIKE 'patch:%'`)).map(
      (r) => String(r.catalog),
    );
  const pick = async (where: ReturnType<typeof sql>) => {
    const [found] = await app.rows(
      sql`SELECT id FROM exercise WHERE user_id IS NULL AND ${where} ORDER BY id LIMIT 1`,
    );
    return String(found?.id);
  };

  it("inserts rows, fills only empty fields and applies a change whose from still matches", async () => {
    const filled = await pick(sql`primary_muscle = 'shoulders'`);
    const kept = await pick(sql`primary_muscle = 'chest'`);
    const retagged = await pick(sql`equipment = 'machine'`);
    await app.rows(
      sql`UPDATE exercise SET instructions = NULL, rank = 0, primary_detail = '{}' WHERE id = ${filled}`,
    );
    await app.rows(
      sql`UPDATE exercise SET instructions = 'Mine', rank = 77, primary_detail = '{}' WHERE id = ${kept}`,
    );
    const before = await count();
    const added = newRow("Cable lateral raise");
    const outcomes = await applyCatalogPatches(db(), {
      gate: false,
      files: [
        source("0001-test.json", {
          insert: [added],
          fill: [
            { id: filled, primary_detail: ["side_delts"], instructions: "Fill", rank: 12 },
            { id: kept, instructions: "Overwrite", rank: 5 },
          ],
          change: [{ id: retagged, field: "equipment", from: "machine", to: "cable" }],
        }),
      ],
    });
    expect(outcomes).toMatchObject([
      { file: "0001-test.json", status: "applied", inserted: 1, filled: 1, changed: 1 },
    ]);
    expect(await count()).toBe(before + 1);
    expect(await row(added.id)).toMatchObject({ title: "Cable lateral raise", equipment: "cable" });
    expect(await row(filled)).toMatchObject({
      instructions: "Fill",
      rank: 12,
      primary_detail: '["side_delts"]',
    });
    // A value somebody set is never overwritten.
    expect(await row(kept)).toMatchObject({ instructions: "Mine", rank: 77 });
    expect(await row(retagged)).toMatchObject({ equipment: "cable" });
    expect(await recorded()).toEqual(["patch:0001-test.json"]);
  });

  it("skips and reports a change when the admin changed the value, and its dependent fills", async () => {
    const edited = await pick(sql`equipment = 'machine'`);
    const moved = await pick(sql`primary_muscle = 'lats'`);
    await app.rows(sql`UPDATE exercise SET equipment = 'barbell' WHERE id = ${edited}`);
    await app.rows(sql`UPDATE exercise SET primary_detail = '{}' WHERE id = ${moved}`);
    const [outcome] = await applyCatalogPatches(db(), {
      gate: false,
      files: [
        source("0001-test.json", {
          change: [
            { id: edited, field: "equipment", from: "machine", to: "cable" },
            // The admin's value is lats; the patch expects shoulders, so this is skipped ...
            { id: moved, field: "primary_muscle", from: "shoulders", to: "chest" },
          ],
          // ... and this fill, valid only after that change, goes with it.
          fill: [{ id: moved, primary_detail: ["upper_chest"] }],
        }),
      ],
    });
    expect(outcome).toMatchObject({
      status: "applied",
      changed: 0,
      skippedChanges: [`${edited}:equipment`, `${moved}:primary_muscle`],
      skippedFills: [`${moved}:primary_detail`],
    });
    expect(await row(edited)).toMatchObject({ equipment: "barbell" });
    expect(await row(moved)).toMatchObject({ primary_muscle: "lats", primary_detail: "[]" });
  });

  it("keeps an admin edit made while the patch waits for the row, and writes only its own fields", async () => {
    const id = await pick(sql`primary_muscle = 'chest'`);
    await app.rows(
      sql`UPDATE exercise SET instructions = NULL, rank = 0, aka = 'before' WHERE id = ${id}`,
    );
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    // The admin's save: holds the row, then commits an instructions value and an unrelated field.
    const admin = app.services.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM exercise WHERE id = ${id} FOR UPDATE`);
      await gate;
      await tx.execute(
        sql`UPDATE exercise SET instructions = 'Admin', aka = 'Admin aka' WHERE id = ${id}`,
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const patching = applyCatalogPatches(db(), {
      gate: false,
      files: [source("0001-test.json", { fill: [{ id, instructions: "Fill", rank: 12 }] })],
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await admin;
    await patching;
    const [after] = await app.rows(
      sql`SELECT instructions, aka, rank FROM exercise WHERE id = ${id}`,
    );
    // The fill saw the admin's value and left it; the field it did not touch is not reverted.
    expect(after).toMatchObject({ instructions: "Admin", aka: "Admin aka", rank: 12 });
  });

  it("applies the fills a skipped change does not affect and reports the others", async () => {
    const id = await pick(sql`primary_muscle = 'shoulders'`);
    await app.rows(
      sql`UPDATE exercise SET primary_muscle = 'lats', secondary_muscles = '{biceps}',
            primary_detail = '{}', secondary_detail = '{}' WHERE id = ${id}`,
    );
    const [outcome] = await applyCatalogPatches(db(), {
      gate: false,
      files: [
        source("0001-test.json", {
          change: [{ id, field: "primary_muscle", from: "shoulders", to: "chest" }],
          fill: [{ id, primary_detail: ["upper_chest"], secondary_detail: ["brachialis"] }],
        }),
      ],
    });
    expect(outcome).toMatchObject({
      status: "applied",
      changed: 0,
      filled: 1,
      skippedChanges: [`${id}:primary_muscle`],
      skippedFills: [`${id}:primary_detail`],
    });
    expect(await row(id)).toMatchObject({ primary_muscle: "lats", primary_detail: "[]" });
    const [stored] = await app.rows(
      sql`SELECT to_json(secondary_detail)::text AS d FROM exercise WHERE id = ${id}`,
    );
    expect(stored?.d).toBe('["brachialis"]');
  });

  it("frees a title before another row takes it", async () => {
    const [first, second] = await Promise.all([
      pick(sql`primary_muscle = 'chest'`),
      pick(sql`primary_muscle = 'lats'`),
    ]);
    const firstTitle = String((await row(first))?.title);
    const secondTitle = String((await row(second))?.title);
    const added = newRow(firstTitle);
    // A rename plus a new row on the old title, and a swap of two titles.
    const [outcome] = await applyCatalogPatches(db(), {
      gate: false,
      files: [
        source("0001-test.json", {
          insert: [added],
          change: [
            { id: first, field: "title", from: firstTitle, to: secondTitle },
            { id: second, field: "title", from: secondTitle, to: `${firstTitle} (renamed)` },
          ],
        }),
      ],
    });
    expect(outcome).toMatchObject({ status: "applied", inserted: 1, changed: 2 });
    expect((await row(first))?.title).toBe(secondTitle);
    expect((await row(second))?.title).toBe(`${firstTitle} (renamed)`);
    expect((await row(added.id))?.title).toBe(firstTitle);
  });

  it("refuses repeated entries in an array value, and compares arrays as sets", async () => {
    const id = uuidv7();
    for (const patch of [
      { fill: [{ id, secondary_muscles: ["chest", "chest"] }] },
      { change: [{ id, field: "secondary_muscles", from: ["chest", "chest"], to: ["chest"] }] },
      { fill: [{ id, primary_detail: ["upper_chest", "upper_chest"] }] },
    ]) {
      expect(() => parsePatchFile("0001-dup.json", JSON.stringify(patch))).toThrow(
        /repeats an entry/u,
      );
    }
  });

  it("compares arrays as sets in a change", async () => {
    const id = await pick(sql`cardinality(secondary_muscles) = 2`);
    const [first = "", second = ""]: string[] = JSON.parse(
      String((await row(id))?.secondary_muscles),
    );
    const [outcome] = await applyCatalogPatches(db(), {
      gate: false,
      files: [
        source("0001-test.json", {
          change: [
            // Stored in the other order: still the same set.
            { id, field: "secondary_muscles", from: [second, first], to: [first] },
          ],
        }),
      ],
    });
    expect(outcome).toMatchObject({ changed: 1, skippedChanges: [] });
    expect((await row(id))?.secondary_muscles).toBe(JSON.stringify([first]));
  });

  it("is a no-op the second time, and refuses an applied file whose bytes changed", async () => {
    const file = source("0001-test.json", { insert: [newRow("Cable lateral raise")] });
    await applyCatalogPatches(db(), { gate: false, files: [file] });
    const after = await count();
    expect(await applyCatalogPatches(db(), { gate: false, files: [file] })).toMatchObject([
      { status: "unchanged" },
    ]);
    expect(await count()).toBe(after);
    const edited = source("0001-test.json", { insert: [newRow("Another")] });
    await expect(applyCatalogPatches(db(), { gate: false, files: [edited] })).rejects.toThrow(
      /changed after it was applied/u,
    );
    expect(await count()).toBe(after);
  });

  it("writes nothing when a file fails validation", async () => {
    const before = await count();
    const existing = await pick(sql`TRUE`);
    const missing = uuidv7();
    const existingTitle = String((await row(existing))?.title);
    const bad: [string, string][] = [
      ["an unknown id", { insert: [newRow("Fine")], fill: [{ id: missing, rank: 1 }] }],
      ["a taken id", { insert: [{ ...newRow("Fine"), id: existing }] }],
      ["a repeated title", { insert: [newRow("Repeated"), newRow("repeated")] }],
      [
        "a title already in the catalog",
        { insert: [{ ...newRow("x"), title: existingTitle.toUpperCase() }] },
      ],
      [
        "a detail outside its group",
        { insert: [{ ...newRow("Fine"), primary_detail: ["upper_chest"] }] },
      ],
      ["an unknown detail slug", { insert: [{ ...newRow("Fine"), primary_detail: ["wings"] }] }],
      ["a field the file may not have", { insert: [], extra: 1 }],
    ].map(([label, patch]) => [String(label), JSON.stringify(patch)]);
    for (const [label, text] of bad) {
      await expect(
        applyCatalogPatches(db(), { gate: false, files: [{ name: "0001-bad.json", text }] }),
        label,
      ).rejects.toThrow(CatalogPatchError);
    }
    expect(await count()).toBe(before);
    expect(await recorded()).toEqual([]);
  });

  it("refuses a fill that would break the detail rule when nothing was skipped", async () => {
    const id = await pick(sql`primary_muscle = 'shoulders'`);
    await app.rows(sql`UPDATE exercise SET primary_detail = '{}' WHERE id = ${id}`);
    await expect(
      applyCatalogPatches(db(), {
        gate: false,
        files: [source("0001-bad.json", { fill: [{ id, primary_detail: ["obliques"] }] })],
      }),
    ).rejects.toThrow(CatalogPatchError);
    expect((await row(id))?.primary_detail).toBe("[]");
  });

  it("applies files in name order", async () => {
    const first = newRow("First");
    await applyCatalogPatches(db(), {
      gate: false,
      files: [
        // The second file changes a row the first inserts' sibling; names, not array order, rule.
        source("0002-b.json", { insert: [newRow("Second")] }),
        source("0001-a.json", { insert: [first] }),
      ],
    });
    const stamps = await app.rows(
      sql`SELECT catalog FROM reference_import WHERE catalog LIKE 'patch:%' ORDER BY imported_at, catalog`,
    );
    expect(stamps.map((r) => String(r.catalog))).toEqual([
      "patch:0001-a.json",
      "patch:0002-b.json",
    ]);
  });

  describe("the gate", () => {
    it("waits for the minimum app version, then applies", async () => {
      const added = newRow("Gated cable raise");
      const gated = source("0001-gated.json", { requires_app_version: "1.4.0", insert: [added] });
      const later = source("0002-later.json", { insert: [newRow("Later")] });
      const before = await count();
      const options = { gate: true, files: [gated, later] };

      // No minimum set: the file and the one after it wait.
      expect(await applyCatalogPatches(db(), options)).toMatchObject([
        { status: "waiting" },
        { status: "waiting" },
      ]);
      await app.rows(
        sql`INSERT INTO app_setting (key, value, updated_at) VALUES ('minimum_app_version', '"1.3.9"'::jsonb, now())`,
      );
      expect(await applyCatalogPatches(db(), options)).toMatchObject([
        { status: "waiting" },
        { status: "waiting" },
      ]);
      expect(await count()).toBe(before);

      await app.rows(
        sql`UPDATE app_setting SET value = '"1.4.0"'::jsonb WHERE key = 'minimum_app_version'`,
      );
      expect(await applyCatalogPatches(db(), options)).toMatchObject([
        { status: "applied", inserted: 1 },
        { status: "applied", inserted: 1 },
      ]);
      expect(await count()).toBe(before + 2);
    });

    it("applies at once when the gate is off", async () => {
      const gated = source("0001-gated.json", {
        requires_app_version: "9.0.0",
        insert: [newRow("Ungated")],
      });
      expect(await applyCatalogPatches(db(), { gate: false, files: [gated] })).toMatchObject([
        { status: "applied" },
      ]);
    });
  });

  it("applies a waiting patch when the minimum is raised through the release procedure", async () => {
    const added = newRow("Released cable raise");
    const gated = source("0001-gated.json", { requires_app_version: "1.4.0", insert: [added] });
    const gatedApp = await createTestApp({
      config: { adminEmails: [ADMIN], catalogPatchGate: true, catalogPatches: [gated] },
      fetch: fakeNetwork({}).fetch,
    });
    try {
      await seedCatalog(gatedApp.services.db, bundledCatalogText());
      const admin = gatedApp.client((await createFullAdmin(gatedApp, ADMIN)).headers);
      const present = async () =>
        (await gatedApp.rows(sql`SELECT 1 FROM exercise WHERE id = ${added.id}`)).length;

      await applyBundledPatches(gatedApp.services.db, {
        gate: true,
        files: gatedApp.services.config.catalogPatches,
      });
      expect(await present()).toBe(0);
      await admin.admin.releases.setMinimum({ version: "1.3.0" });
      expect(await present()).toBe(0);
      await admin.admin.releases.setMinimum({ version: "1.4.0" });
      expect(await present()).toBe(1);
    } finally {
      await gatedApp.close();
    }
  });
});

describe("the committed patches", () => {
  const folder = bundledPatchesFolder();
  const onDisk = readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .toSorted();

  it("are all bundled, in name order, byte for byte, and valid", () => {
    const bundled = bundledPatches();
    expect(bundled.map((patch) => patch.name)).toEqual(onDisk);
    for (const patch of bundled) {
      expect(patch.name).toMatch(/^\d{4}-[a-z0-9-]+\.json$/u);
      expect(() => parsePatchFile(patch.name, patch.text)).not.toThrow();
      expect(patch.text).toBe(readFileSync(join(folder, patch.name), "utf8"));
    }
  });

  it("keep the original bytes, so a whitespace-only edit changes the fingerprint", () => {
    const dir = mkdtempSync(join(tmpdir(), "patches-"));
    try {
      const text = '{  "insert" : [ ],\n\n "fill":[]}\n';
      writeFileSync(join(dir, "0002-b.json"), text);
      writeFileSync(join(dir, "0001-a.json"), "{}");
      writeFileSync(join(dir, "notes.txt"), "ignored");
      const bundled = bundledPatches(dir);
      expect(bundled.map((patch) => patch.name)).toEqual(["0001-a.json", "0002-b.json"]);
      expect(bundled[1]?.text).toBe(text);
      // Same JSON content, different bytes.
      expect(JSON.stringify(JSON.parse(text))).not.toBe(text);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
