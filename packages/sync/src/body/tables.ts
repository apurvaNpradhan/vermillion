import type { BodyMetric } from "@workspace/shared";
import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";
export const bodyMeasurement = sqliteTable(
  "body_measurement",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    metric: text("metric").$type<BodyMetric>().notNull(),
    value: real("value").notNull(),
    measured_at: text("measured_at").notNull(),
    local_date: text("local_date").notNull(),
    source: text("source").$type<"manual" | "health">().notNull(),
    created_at: text("created_at").notNull(),
    restore: integer("restore"),
  },
  (t) => [index("body_measurement_metric_date_idx").on(t.metric, t.local_date)],
);
