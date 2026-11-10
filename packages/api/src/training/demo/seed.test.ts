import { user } from "@workspace/db/schema/auth";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { bundledCatalogText } from "../../exercise/operations/bundled-catalog";
import { importCatalog } from "../../exercise/operations/import-catalog";
import { createTestApp } from "../../platform/testing/harness";
import { urlForDatabase } from "../../platform/testing/postgres";
import { runTrainingDemo } from "./seed";

describe("local demo plans", () => {
  it("rolls back incomplete fixtures, seeds one owner, and preserves edits on a repeated run", async () => {
    const app = await createTestApp();
    try {
      await app.services.db.insert(user).values([
        { id: "demo-owner", name: "Demo", email: "demo-owner@example.com" },
        { id: "other-owner", name: "Other", email: "other-owner@example.com" },
      ]);
      const [database] = await app.rows(sql`SELECT current_database() AS name`);
      const url = urlForDatabase(z.string().parse(database?.name));
      await expect(runTrainingDemo(url, "demo-owner")).rejects.toThrow("Demo exercise is missing");
      expect(await app.rows(sql`SELECT count(*)::int AS total FROM workout`)).toEqual([
        { total: 0 },
      ]);
      await importCatalog(app.services.db, bundledCatalogText());
      expect(await runTrainingDemo(url, "demo-owner")).toEqual({
        createdPrograms: 2,
        createdWorkouts: 7,
      });
      expect(await app.rows(sql`SELECT count(*)::int AS total FROM program_slot`)).toEqual([
        { total: 12 },
      ]);
      expect(await app.rows(sql`SELECT DISTINCT user_id FROM workout`)).toEqual([
        { user_id: "demo-owner" },
      ]);
      expect(await app.rows(sql`SELECT count(*)::int AS total FROM workout_exercise`)).toEqual([
        { total: 37 },
      ]);
      await app.rows(
        sql`UPDATE workout SET note = 'Edited by the owner' WHERE title = 'Demo · Full body A' RETURNING id`,
      );
      expect(await runTrainingDemo(url, "demo-owner")).toEqual({
        createdPrograms: 0,
        createdWorkouts: 0,
      });
      expect(
        await app.rows(sql`SELECT note FROM workout WHERE title = 'Demo · Full body A'`),
      ).toEqual([{ note: "Edited by the owner" }]);
      await expect(runTrainingDemo(url, "missing-owner")).rejects.toThrow("existing account");
    } finally {
      await app.close();
    }
  });
});
