import { createdAt, deletedAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { sql } from "drizzle-orm";
import { check, date, doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bodyMeasurement = pgTable(
  "body_measurement",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    localDate: date("local_date").notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("body_measurement_metric_date_idx")
      .on(t.userId, t.metric, t.localDate.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    check(
      "body_measurement_metric",
      sql`${t.metric} IN ('weight','neck','shoulders','chest','waist','hips','left_bicep','right_bicep','left_forearm','right_forearm','left_thigh','right_thigh','left_calf','right_calf')`,
    ),
    check(
      "body_measurement_value",
      sql`(${t.metric} = 'weight' AND ${t.value} BETWEEN 20 AND 400) OR (${t.metric} <> 'weight' AND ${t.value} BETWEEN 5 AND 250)`,
    ),
    check("body_measurement_source", sql`${t.source} IN ('manual','health')`),
  ],
);

/** Minimal markers survive content purging and prevent stale offline resurrection. */
export const deletedBodyMeasurement = pgTable("deleted_body_measurement", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
