import { describe, expect, it } from "vitest";

import { deleteEquipment, restoreEquipment, upsertEquipment } from "./equipment-store";
import { setupSessions } from "./session-fixtures";

describe("restoring deleted equipment", () => {
  it("puts a bar and a plate back through a view, which rejects an upsert", async () => {
    const s = await setupSessions();
    // PowerSync's tables are SQLite views with INSTEAD OF triggers; a view cannot take an
    // INSERT … ON CONFLICT, so the restore must be a plain insert.
    s.sqlite.exec(`
      ALTER TABLE gym_equipment RENAME TO gym_equipment_data;
      CREATE VIEW gym_equipment AS SELECT * FROM gym_equipment_data;
      CREATE TRIGGER gym_equipment_insert INSTEAD OF INSERT ON gym_equipment BEGIN
        INSERT INTO gym_equipment_data VALUES (NEW.id, NEW.user_id, NEW.gym_id, NEW.kind,
          NEW.weight_kg, NEW.unit, NEW.label, NEW.count, NEW.enabled, NEW.created_at,
          NEW.restore, NEW.seed);
      END;
      CREATE TRIGGER gym_equipment_delete INSTEAD OF DELETE ON gym_equipment BEGIN
        DELETE FROM gym_equipment_data WHERE id = OLD.id;
      END;
    `);
    const [bar, plate] = await upsertEquipment(
      s.training,
      [
        { kind: "bar", weight_kg: 20, unit: "kg", label: null, count: null, enabled: true },
        { kind: "plate", weight_kg: 0.5, unit: "kg", label: null, count: 2, enabled: false },
      ],
      s.installId,
    );
    for (const id of [bar!, plate!]) {
      const before = s.one("gym_equipment", id);
      const deleted = await deleteEquipment(s.training, id, s.installId);
      expect(deleted).not.toBeNull();
      expect(s.one("gym_equipment", id)).toBeUndefined();
      await restoreEquipment(s.training, deleted!, s.installId);
      expect(s.one("gym_equipment", id)).toEqual({ ...before, restore: 1, seed: null });
      // Restoring twice changes nothing.
      await restoreEquipment(s.training, deleted!, s.installId);
      expect(s.all("gym_equipment").filter((row) => row["id"] === id)).toHaveLength(1);
    }
  });
});
