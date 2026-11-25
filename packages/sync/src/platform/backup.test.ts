import { expect, it } from "vitest";

import { visitBackupPages } from "./backup";
import { setupSessions } from "../training/sessions/session-fixtures";
import type { WireRow } from "./row-conversion";

it("exports owner rows in bounded pages and omits reference data and local fields", async () => {
  const { training, sqlite } = await setupSessions();
  sqlite.exec(`
    INSERT INTO exercise (id, user_id, title) VALUES
      ('reference', NULL, 'Reference'), ('foreign', 'other', 'Foreign'), ('own', 'owner', 'Custom');
    INSERT INTO user_preferences (id, user_id, ui, patch)
      VALUES ('owner', 'owner', '{"sounds":false}', '{"ui":{"sounds":false}}');
    INSERT INTO program (id, user_id, title, restore) VALUES ('p1', 'owner', 'Plan', 1);
    WITH RECURSIVE seq(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1001
    )
    INSERT INTO training_session (id, user_id, title)
      SELECT printf('s%04d', n), 'owner', 'Workout' FROM seq;
  `);
  const pages = new Map<string, (readonly WireRow[])[]>();
  await visitBackupPages(training, "owner", async (table, page) => {
    const existing = pages.get(table) ?? [];
    existing.push(page);
    pages.set(table, existing);
  });

  expect(pages.get("exercise")?.flat()).toMatchObject([{ id: "own", title: "Custom" }]);
  expect(pages.get("user_preferences")?.[0]?.[0]).not.toHaveProperty("patch");
  expect(pages.get("program")?.[0]?.[0]).not.toHaveProperty("restore");
  expect(pages.get("training_session")?.map((page) => page.length)).toEqual([1000, 1]);
  expect(pages.get("workout")).toEqual([[]]);
  expect(pages.has("device_owner")).toBe(false);
});

it.each(["kg", "lb", null])("exports exercise unit %s", async (unit) => {
  const { training, sqlite } = await setupSessions();
  sqlite
    .prepare("INSERT INTO exercise_setting (id, user_id, exercise_id, unit) VALUES (?, ?, ?, ?)")
    .run("setting", "owner", "exercise", unit);
  const settings: WireRow[] = [];
  await visitBackupPages(training, "owner", async (table, page) => {
    if (table === "exercise_setting") settings.push(...page);
  });
  expect(settings).toMatchObject([{ id: "setting", exercise_id: "exercise", unit }]);
});
