import { createdAt, deletedAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

/**
 * A front, side or back photo on a date (ADR 0041). The image is the `media` row `media_id` names
 * (kind `progress_photo`); the row points at media and media never points back, so there is no
 * foreign key: a deleted media stays as a tombstone. One photo per media.
 */
export const progressPhoto = pgTable(
  "progress_photo",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull(),
    pose: text("pose").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    localDate: date("local_date").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("progress_photo_date_idx")
      .on(t.userId, t.localDate.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("progress_photo_media_id_idx").on(t.mediaId),
    check("progress_photo_pose", sql`${t.pose} IN ('front','side','back')`),
  ],
);

/** Minimal markers survive content purging and prevent stale offline resurrection. */
export const deletedProgressPhoto = pgTable("deleted_progress_photo", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
